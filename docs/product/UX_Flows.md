# BitStockerz — User flows

These flows describe the current Angular application.
October 4 additions are local changes; hosted and live-provider checks remain outstanding.
See [product contracts](PRODUCT_EXTENSIONS.md) for execution and recovery limits.

## 1. Strategy research

1. Sign in at `/login` with a passkey or configured Google/Apple provider.
2. Open Strategies and create a definition or start from a template.
3. Add indicators, entry/exit conditions, and required stop/target percentages.
4. Validate the definition.
5. Save the strategy.
6. Select **Run backtest** from strategy detail.
7. Select the symbol, inclusive dates, initial equity, and simulation assumptions.
8. Submit the synchronous run.
9. Inspect metrics, the equity curve, trade markers, and paged trades.
10. Compare owned runs and inspect their pinned definitions, settings, and benchmarks.
11. Export complete results or trades if needed.

The out-of-sample label records a selected historical period; it does not automatically split data.
Rerunning uses the latest saved strategy version.
Historical run exports retain their original version pins.

## 2. Manual paper trading

Signup provisions one USD paper account.
The default starting balance is $100,000.00; operators can configure it.

1. Open Trade.
2. Select an active symbol.
3. Submit a positive decimal-string market BUY or SELL.
4. Inspect the filled order or persisted rejection.
5. Inspect account cash, positions, portfolio P&L, and history.

The client retains a `client_order_id` until inputs change or a terminal response arrives.
A replay with the same payload returns the original order without another fill.
A changed payload with that identifier returns a conflict.
Cash, position, execution, and order changes commit atomically.
Missing held-symbol prices cause valuation errors rather than zero portfolio values.

## 3. Forward paper testing

1. Open Automations.
2. Select a saved strategy version, symbol, and allocation.
3. Create the paused runner.
4. Activate it after inspecting the pinned settings.
5. Inspect evaluation activity, orders, and attributed performance.
6. Pause it when investigation is needed.
7. Stop it only after its held position and pending intent are cleared.

Scheduling requires database mode and configured ingestion.
Runners evaluate the newest completed bar without replaying missed bars.
Stale prices or changed manual positions pause execution for inspection.
Pause retains positions; reset stops runners and archives the ledger.

## 4. Markets

1. Open Markets and select a symbol/timeframe/date range.
2. Inspect candles, timestamps, data mode, and the OHLCV table.
3. Select a saved strategy for indicator overlays.
4. Add the symbol to the owned watchlist if needed.

## 5. Profile and recovery

1. Open `/profile` and inspect email, currency, passkeys, and linked providers.
2. Save an optional display name.
3. If sign-in is older than five minutes, sign in again before linking a provider.
4. Start linking from Profile.
5. Complete provider authorization in the same browser session.
6. Reload Profile to confirm the linked method.

Recovery uses a working passkey or a previously linked provider.
Email matching alone cannot recover an account or attach a provider.
Users without a working method have no ownership bypass.
Security settings support additional passkey enrollment and owned-session revocation.

## 6. Account data

1. Open account data settings.
2. Download personal JSON when an export is needed.
3. For reset, sign in freshly and enter the exact confirmation `RESET`.
4. Inspect the retained archive and restored paper cash.
5. For account deletion, sign in freshly and confirm the exact email.

Deletion rejects active jobs and removes owned active data.
Host logs and backups require separate operator retention controls.
See [the lifecycle policy](../database/Data_Lifecycle_and_Deletion_Policy.md).

## 7. Loading, empty, and error states

Dashboard widgets load independently.
Empty strategy/backtest lists provide creation actions.
A completed run without trades retains its metrics and curve.
Expired sessions redirect protected routes to `/login`.
Business order rejections retain their reason and cannot alter the ledger.
Error screens provide a request ID when the API supplies one.

The client stores bearer sessions in `sessionStorage` and validates them through `/auth/me`.
Development uses a relative `/api` proxy.
Email shortcuts appear only in non-production builds with development API access enabled.
