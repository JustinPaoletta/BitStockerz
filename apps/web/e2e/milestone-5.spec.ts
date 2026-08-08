import { expect, type Page, test } from '@playwright/test';

async function registerWithEmail(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#display').fill('E2E Trader');
  await page.getByText('Email fallback').click();
  await page.getByRole('button', { name: 'Email register' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Your trading workspace' })).toBeVisible();
}

async function goNav(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', {
    name,
    exact: true,
  }).click();
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe('Milestone 5 seed flows', () => {
  test('strategy lab create → backtest launch navigation', async ({ page }) => {
    const email = `e2e-strategy-${Date.now()}@example.com`;
    await registerWithEmail(page, email);

    await goNav(page, 'Strategies');
    await expect(page.getByRole('heading', { name: 'Your strategies' })).toBeVisible();
    await page.locator('section.page-heading').getByRole('link', { name: 'Create strategy' }).click();

    await page.locator('#name').fill(`E2E SMA ${Date.now()}`);
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByText('Definition is valid.')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { name: /E2E SMA/ })).toBeVisible();
    await page.getByRole('link', { name: 'Run backtest' }).click();
    await expect(page).toHaveURL(/\/backtests\/new\?strategy_id=/);
    await expect(page.getByText(/Strategy:/)).toBeVisible();

    await page.locator('#start').fill(dateOffset(-90));
    await page.locator('#end').fill(dateOffset(0));
    await page.getByRole('button', { name: 'Run backtest' }).click();
    await expect(page).toHaveURL(/\/backtests\/[0-9a-f-]+/i, { timeout: 60_000 });
    await expect(page.getByText('Equity curve')).toBeVisible();
    await expect(page.getByText('Final equity')).toBeVisible();
  });

  test('paper trade BUY fill and oversized reject', async ({ page }) => {
    const email = `e2e-trade-${Date.now()}@example.com`;
    await registerWithEmail(page, email);

    await goNav(page, 'Trade');
    await expect(page.getByRole('heading', { name: 'Trade desk' })).toBeVisible();

    await page.locator('#qty').fill('1');
    await page.getByRole('button', { name: 'Submit market order' }).click();
    await expect(page.getByText(/Filled BUY/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('table').filter({ hasText: 'AAPL' }).first()).toBeVisible();

    await page.locator('#qty').fill('9999');
    await page.getByRole('button', { name: 'Submit market order' }).click();
    await expect(page.getByRole('status')).toContainText(/Rejected: MAX_ORDER_NOTIONAL/i, {
      timeout: 30_000,
    });
  });
});
