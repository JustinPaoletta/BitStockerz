import { createHash } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';

const origin = 'http://127.0.0.1:4200';
interface Session {
  access_token: string;
  user: { id: string; email: string; display_name: string };
}

async function account(page: Page): Promise<Session> {
  const response = await page.request.post('http://127.0.0.1:4000/api/auth/register', {
    data: {
      email: `profile-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      display_name: 'Recovery Trader',
    },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

async function configuredProvider(
  page: Page,
  provider: 'google' | 'apple' = 'google',
): Promise<void> {
  await page.route('**/api/auth/providers', (route) =>
    route.fulfill({ json: { google: provider === 'google', apple: provider === 'apple' } }),
  );
}

test('profile edits persist after reload and fresh sign-in, including on mobile', async ({
  page,
}) => {
  const session = await account(page);
  await page.addInitScript((token) => {
    if (!sessionStorage.getItem('bs.access_token'))
      sessionStorage.setItem('bs.access_token', token);
  }, session.access_token);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Account settings' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(session.user.email);
  await page.getByLabel('Display name', { exact: true }).fill('  Saved Recovery Trader  ');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status')).toContainText('Profile saved.');
  await page.reload();
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(
    'Saved Recovery Trader',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const loggedIn = await page.request.post('http://127.0.0.1:4000/api/auth/login', {
    data: { email: session.user.email },
  });
  expect(loggedIn.ok()).toBe(true);
  const freshSession = (await loggedIn.json()) as Session;
  expect(freshSession.user.id).toBe(session.user.id);
  await page.evaluate(
    (token) => sessionStorage.setItem('bs.access_token', token),
    freshSession.access_token,
  );
  await page.reload();
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(
    'Saved Recovery Trader',
  );
});

for (const provider of ['google', 'apple'] as const) {
  test(`${provider} callback restores a protected destination and scrubs the code before exchange`, async ({
    page,
  }) => {
    const session = await account(page);
    await configuredProvider(page, provider);
    const providerName = provider === 'google' ? 'Google' : 'Apple';
    const authorizationUrl =
      provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth?state=browser-state'
        : 'https://appleid.apple.com/auth/authorize?state=browser-state';
    let challenge = '';
    let exchanged = false;
    await page.route(`**/api/auth/oauth/${provider}/browser/start`, async (route) => {
      const data = route.request().postDataJSON();
      expect(data.return_path).toBe('/profile');
      challenge = data.code_challenge;
      expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(data.verifier).toBeUndefined();
      await route.fulfill({
        json: {
          provider,
          state: 'browser-state',
          expires_in_seconds: 300,
          authorization_url: authorizationUrl,
        },
      });
    });
    await page.route(`${new URL(authorizationUrl).origin}/**`, (route) =>
      route.fulfill({
        status: 302,
        headers: {
          location: `${origin}/auth/oauth/callback#code=one-use-code&state=browser-state`,
        },
        body: '',
      }),
    );
    await page.route('**/api/auth/oauth/session/exchange', async (route) => {
      const data = route.request().postDataJSON();
      expect(page.url()).not.toContain('#');
      expect(data.code).toBe('one-use-code');
      expect(createHash('sha256').update(data.verifier).digest('base64url')).toBe(challenge);
      exchanged = true;
      await route.fulfill({ json: { ...session, intent: 'login', return_path: '/profile' } });
    });
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login\?returnUrl=/);
    await expect(
      page.getByRole('button', {
        name: `Continue with ${provider === 'google' ? 'Apple' : 'Google'}`,
      }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: `Continue with ${providerName}` }).click();
    await expect(page).toHaveURL(`${origin}/profile`);
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(session.user.email);
    expect(exchanged).toBe(true);
    expect(await page.evaluate(() => sessionStorage.getItem('bs.oauth_flow'))).toBeNull();
    await page.goto('/auth/oauth/callback#code=one-use-code&state=browser-state');
    await expect(page.getByRole('alert')).toContainText('expired or was already used');
    expect(page.url()).not.toContain('#');
  });
}

test('old-session and cancelled provider linking preserve the current account', async ({
  page,
}) => {
  const session = await account(page);
  await page.addInitScript((token) => {
    if (!sessionStorage.getItem('bs.access_token'))
      sessionStorage.setItem('bs.access_token', token);
  }, session.access_token);
  await configuredProvider(page);
  let starts = 0;
  await page.route('**/api/auth/oauth/google/link/start', async (route) => {
    expect(route.request().headers()['authorization']).toBe(`Bearer ${session.access_token}`);
    starts++;
    if (starts === 1) {
      await route.fulfill({
        status: 401,
        json: { code: 'UNAUTHORIZED', detail: 'Recent sign-in required.' },
      });
    } else {
      await route.fulfill({
        json: {
          provider: 'google',
          state: 'link-state',
          expires_in_seconds: 300,
          authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth?state=link-state',
        },
      });
    }
  });
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({
      status: 302,
      headers: { location: `${origin}/auth/oauth/callback#error=cancelled&state=link-state` },
      body: '',
    }),
  );
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Link Google' }).click();
  await expect(page.getByRole('alert')).toContainText('retry within five minutes');
  expect(await page.evaluate(() => sessionStorage.getItem('bs.access_token'))).toBe(
    session.access_token,
  );
  await page.getByRole('button', { name: 'Link Google' }).click();
  await expect(page.getByRole('alert')).toContainText('cancelled');
  expect(await page.evaluate(() => sessionStorage.getItem('bs.access_token'))).toBe(
    session.access_token,
  );
  await page.getByRole('link', { name: 'Return to Account settings' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(session.user.email);
  await expect(page.getByRole('button', { name: 'Link Google' })).toBeVisible();
});
