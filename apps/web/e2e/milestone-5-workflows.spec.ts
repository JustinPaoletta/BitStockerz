import { expect, type Page, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

function dateOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function register(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#display').fill('Checklist Trader');
  await page.getByText('Email fallback').click();
  await page.getByRole('button', { name: 'Email register' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function goNav(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}

test.describe('Milestone 5 workflows', () => {
  test('shell, lab, backtest, and paper trade flows', async ({ page, context }) => {
    const stamp = Date.now();
    const email = `m5-workflow-${stamp}@example.com`;
    const strategyName = `Workflow SMA ${stamp}`;
    let strategyId = '';

    await register(page, email);
    await expect(page.getByRole('heading', { name: 'Your trading workspace' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(page.getByText('Checklist Trader')).toBeVisible();

    await goNav(page, 'Trade');
    await expect(page).toHaveURL(/\/trade/);
    await goNav(page, 'Strategies');
    await expect(page).toHaveURL(/\/strategies/);
    await goNav(page, 'Backtests');
    await expect(page).toHaveURL(/\/backtests/);
    await goNav(page, 'Dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await page.getByRole('link', { name: 'BitStockerz home' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/trade');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.url()).toMatch(/returnUrl=/);
    await page.locator('#email').fill(email);
    await page.getByText('Email fallback').click();
    await page.getByRole('button', { name: 'Email log in' }).click();
    await expect(page).toHaveURL(/\/trade/);
    await expect(page.getByRole('heading', { name: 'Trade desk' })).toBeVisible();

    await page.goto('/dashboard');
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your trading workspace' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Portfolio summary', exact: true })).toBeVisible();
    await expect(page.getByText('$100,000.00').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Positions', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Strategies', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent backtests', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent trades', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Symbol search', exact: true })).toBeVisible();

    await goNav(page, 'Strategies');
    await page.locator('section.page-heading').getByRole('link', { name: 'Create strategy' }).click();
    await page.locator('#name').fill(strategyName);
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByText('Definition is valid.')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: strategyName })).toBeVisible();
    await expect(page).toHaveURL(/\/strategies\/[0-9a-f-]+/i);
    strategyId = page.url().split('/strategies/')[1]?.split(/[?#]/)[0] ?? '';
    expect(strategyId).toMatch(/[0-9a-f-]{36}/i);

    await goNav(page, 'Dashboard');
    await expect(page.getByText(strategyName)).toBeVisible({ timeout: 15_000 });
    await page
      .locator('li', { hasText: strategyName })
      .getByRole('link', { name: 'Edit', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/strategies/${strategyId}/edit`));
    await expect(page.getByRole('heading', { name: 'Edit strategy' })).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toMatch(/unsaved changes/i);
      await dialog.dismiss();
    });
    await page.locator('#name').fill(`${strategyName} dirty`);
    await page.getByRole('link', { name: 'Back to list' }).click();
    await expect(page).toHaveURL(new RegExp(`/strategies/${strategyId}/edit`));

    await page.locator('#period').fill('25');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(new RegExp(`/strategies/${strategyId}$`));
    await expect(page.getByText(/Strategy · v2/)).toBeVisible({ timeout: 15_000 });
    await page.locator('#version').selectOption('1');
    await expect(page.getByText(/Historical version/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await page.locator('#version').selectOption('2');
    await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: 'Run backtest' }).click();
    await expect(page).toHaveURL(new RegExp(`/backtests/new\\?strategy_id=${strategyId}`));
    await expect(page.getByText(new RegExp(`Strategy: ${strategyName}`))).toBeVisible();
    await page.locator('#start').fill(dateOffset(-90));
    await page.locator('#end').fill(dateOffset(0));
    await page.getByRole('button', { name: 'Run backtest' }).click();
    await expect(page).toHaveURL(/\/backtests\/[0-9a-f-]+/i, { timeout: 60_000 });
    await expect(page.getByText('Equity curve')).toBeVisible();
    await expect(page.getByText('Final equity')).toBeVisible();

    await goNav(page, 'Dashboard');
    const input = page.getByRole('combobox', { name: 'Symbol' });
    await input.click();
    await input.fill('AA');
    await expect(page.getByRole('option').filter({ hasText: 'AAPL' }).first()).toBeVisible({
      timeout: 10_000,
    });
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(input).toHaveValue(/AAPL/i);

    await goNav(page, 'Trade');
    await page.locator('#qty').fill('1');
    await page.getByRole('button', { name: 'Submit market order' }).click();
    await expect(page.getByRole('status')).toContainText(/Filled BUY/i, { timeout: 30_000 });
    await expect(page.locator('table').filter({ hasText: 'AAPL' }).first()).toBeVisible();

    await page.locator('#qty').fill('9999');
    await page.getByRole('button', { name: 'Submit market order' }).click();
    await expect(page.getByRole('status')).toContainText(/Rejected: MAX_ORDER_NOTIONAL/i, {
      timeout: 30_000,
    });
    await expect(page.getByRole('cell', { name: 'REJECTED' }).first()).toBeVisible();

    await page.locator('#side').selectOption('SELL');
    await page.locator('#qty').fill('1');
    await page.getByRole('button', { name: 'Submit market order' }).click();
    await expect(page.getByRole('status')).toContainText(/Filled SELL/i, { timeout: 30_000 });
    await expect(page.getByText('No open positions')).toBeVisible({ timeout: 15_000 });

    await page.locator('#side').selectOption('BUY');
    await page.locator('#qty').fill('1');
    await page.getByRole('button', { name: 'Submit market order' }).click();
    await expect(page.getByRole('status')).toContainText(/Filled BUY/i, { timeout: 30_000 });
    await page.locator('#side').selectOption('SELL');
    await page.locator('#qty').fill('5');
    await page.getByRole('button', { name: 'Submit market order' }).click();
    await expect(
      page.getByText('SELL quantity cannot exceed the currently displayed position.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();
    await page.getByRole('button', { name: 'Need an account? Register' }).click();
    await expect(page.getByRole('button', { name: 'Create with passkey' })).toBeVisible();

    await page.locator('#email').fill(email);
    await page.getByText('Email fallback').click();
    await page.getByRole('button', { name: 'Email log in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await context.addInitScript(() => {
      sessionStorage.removeItem('bs.access_token');
    });
    await page.evaluate(() => sessionStorage.removeItem('bs.access_token'));
    await page.goto('/trade');
    await expect(page).toHaveURL(/\/login/);
  });
});
