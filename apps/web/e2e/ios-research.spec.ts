import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('phone viewport: real WebAuthn registration/login, chart, backtest, history and export', async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const email = `ios-research-${Date.now()}@example.com`;
  await page.goto('http://localhost:4200/login');
  await page.getByRole('button', { name: 'Need an account? Register', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Create with passkey', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Sign in with passkey', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('http://localhost:4200/research');
  await page.getByRole('link', { name: 'Open chart', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Candlestick chart with selected strategy indicators' }),
  ).toBeVisible();
  await expect(page.getByText('Development seed data — simulated prices.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByText('Accessible OHLCV data (latest 50 bars)').click();
  await expect(page.getByRole('columnheader', { name: 'Close', exact: true })).toBeVisible();

  await page.goto('http://localhost:4200/research');
  await page.getByRole('button', { name: 'Set up a backtest' }).click();
  await expect(page).toHaveURL(/\/backtests\/new\?strategy_id=/);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 180);
  await page.locator('#start').fill(start.toISOString().slice(0, 10));
  await page.locator('#end').fill(new Date().toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Run backtest', exact: true }).click();
  await expect(page).toHaveURL(/\/backtests\/[0-9a-f-]+$/, { timeout: 60_000 });
  const resultUrl = page.url();
  await expect(page.getByRole('heading', { name: 'Equity curve', exact: true })).toBeVisible();
  await expect(page.getByText('Final equity', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Equity curve', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to all backtests' }).click();
  await expect(page.getByText('Research crossover').first()).toBeVisible();
  await page.goto(resultUrl);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export results CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('backtest-results.csv');
});
