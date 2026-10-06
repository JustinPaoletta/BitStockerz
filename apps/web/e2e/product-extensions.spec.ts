import { expect, test } from '@playwright/test';
import { STRATEGY_TEMPLATES } from '../src/app/features/strategies/data/strategy-templates';
const api = 'http://127.0.0.1:4000/api';

test('rich definitions survive editing, costed research exports, charts and runner controls', async ({
  page,
}) => {
  const response = await page.request.post(`${api}/auth/register`, {
    data: { email: `extensions-${Date.now()}@example.com` },
  });
  expect(response.ok()).toBe(true);
  const session = await response.json();
  const headers = { Authorization: `Bearer ${session.access_token}` };
  await page.addInitScript(
    (token) => sessionStorage.setItem('bs.access_token', token),
    session.access_token,
  );
  const definition = structuredClone(STRATEGY_TEMPLATES[0].definition);
  definition.entry.conditions.push({ left: { price: 'close' }, op: 'gt', right: { literal: 0 } });
  const saved = await page.request.post(`${api}/strategies`, {
    headers,
    data: { name: 'Rich browser fixture', asset_type: 'EQUITY', timeframe: '1d', definition },
  });
  expect(saved.ok()).toBe(true);
  const strategy = await saved.json();
  await page.goto(`/strategies/${strategy.id}/edit`);
  await expect(page.getByLabel('Period', { exact: true })).toHaveCount(2);
  await page.getByLabel('Period', { exact: true }).first().fill('12');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/strategies/${strategy.id}$`));
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Period', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('Period', { exact: true }).first()).toHaveValue('12');
  await expect(page.getByRole('combobox', { name: 'Relationship', exact: true })).toHaveCount(3);
  await expect(
    page.getByRole('combobox', { name: 'Relationship', exact: true }).first(),
  ).toHaveValue('crosses_above');
  await page.goto(`/backtests/new?strategy_id=${strategy.id}`);
  await page.getByLabel('Equity allocation %', { exact: true }).fill('50');
  await page.getByLabel('Commission (basis points per side)', { exact: true }).fill('10');
  await page.getByLabel('Slippage (basis points per side)', { exact: true }).fill('20');
  await page.getByLabel('Fill timing', { exact: true }).selectOption('next_open');
  await page.getByRole('button', { name: 'Run backtest', exact: true }).click();
  await expect(page).toHaveURL(/\/backtests\/[0-9a-f-]+$/, { timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Equity curve', exact: true })).toBeVisible();
  const id = page.url().split('/').pop();
  const research = await (
    await page.request.get(`${api}/backtests/${id}/research`, { headers })
  ).json();
  expect(research.definition.indicators).toHaveLength(2);
  expect(research.definition.entry.conditions).toHaveLength(2);
  expect(research.run.simulation).toMatchObject({
    allocation_pct: 50,
    commission_bps: 10,
    slippage_bps: 20,
    execution_timing: 'next_open',
  });
  expect(research.results.benchmark).toBeTruthy();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export results CSV' }).click();
  expect((await download).suggestedFilename()).toBe('backtest-results.csv');
  await page.goto('/market');
  await page.getByRole('button', { name: 'Save symbol' }).click();
  await expect(page.getByRole('button', { name: 'AAPL', exact: true })).toBeVisible();
  await page.goto('/automations');
  await page.getByLabel('Saved strategy', { exact: true }).selectOption(strategy.id);
  await page.getByRole('button', { name: 'Create paused runner' }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Evaluate latest bar' }).click();
  await expect(page.getByText('Last evaluated bar:', { exact: false })).not.toContainText('None');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.goto('/account/data');
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download account JSON' }).click();
  expect((await exported).suggestedFilename()).toContain('account');
});

test('additional passkeys use real browser verification and sign into the same account', async ({
  page,
  context,
}) => {
  const email = `keys-${Date.now()}@example.com`;
  await page.goto('http://localhost:4200/login');
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  let { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.getByRole('button', { name: 'Need an account? Register', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Create with passkey', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const initialToken = await page.evaluate(() => sessionStorage.getItem('bs.access_token'));
  const original = await (
    await page.request.get(`${api}/auth/me`, {
      headers: { Authorization: `Bearer ${initialToken}` },
    })
  ).json();
  await page.goto('http://localhost:4200/account/security');
  await expect(page.getByRole('button', { name: 'Remove passkey', exact: true })).toHaveCount(1);
  const first = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  ({ authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  }));
  await page.getByRole('button', { name: 'Add passkey', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove passkey', exact: true })).toHaveCount(2);
  const second = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  const credentials = [...first.credentials, ...second.credentials];
  expect(credentials).toHaveLength(2);
  for (const credential of credentials) {
    await cdp.send('WebAuthn.clearCredentials', { authenticatorId });
    await cdp.send('WebAuthn.addCredential', { authenticatorId, credential });
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Sign in with passkey', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('http://localhost:4200/account/security');
    await expect(page.getByRole('button', { name: 'Remove passkey', exact: true })).toHaveCount(2);
    const token = await page.evaluate(() => sessionStorage.getItem('bs.access_token'));
    const me = await (
      await page.request.get(`${api}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    expect(me.id ?? me.user?.id).toBe(original.id ?? original.user?.id);
  }
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
});
