# BitStockerz – UX Flows

These flows describe the user-facing behavior of the Angular application.

Strategy → Backtest and paper-trading flows are completable in the Milestone 5
Angular app (PR #11). Backend contracts for strategies, backtests, and trading
shipped in Sprints 2.1–4.3.

## 1. Strategy → Backtest Flow
1. Sign in at `/login` with a passkey (primary) or email fallback.
2. Open **Strategies**, create or edit a strategy (validate, then save).
3. From strategy detail, choose **Run backtest** (or open `/backtests/new`
   with `strategy_id`).
4. Confirm symbol, inclusive date range, and initial equity. Timeframe is
   locked to the strategy when launched from Strategy Lab.
5. Submit the synchronous run and show a disabled/loading submit state.
6. Navigate to `/backtests/:id` when execution completes.
7. Display result metrics, a responsive equity curve, and the first stable-id
   page of real trades. Load additional trades only while
   `trades_page.has_more` is true.
8. `/backtests` lists owned runs and links each run to its result detail.

The app uses the relative `/api` development proxy and stores the bearer token
in `sessionStorage`. The auth guard validates the session via `/auth/me`.

## 2. Paper Trading Flow
1. A successful signup provisions one $100,000.00 USD paper account.
2. Open **Trade**, select an active symbol, and submit a decimal-string market
   BUY/SELL with a stable `client_order_id` until inputs change or a terminal
   response arrives.
3. The API fills immediately at the latest eligible close, or returns a
   persisted `REJECTED` order explaining the business rule.
4. Filled cash, average-cost position, execution, and order state commit as
   one transaction; replaying the same client id does not fill again.
5. Refresh the account, current positions, portfolio summary, recent orders,
   and execution history independently.
6. Empty positions render an empty-state; selling more than the displayed
   quantity is blocked in the client before submit.
7. Unavailable held-symbol prices show a valuation error rather than a
   misleading zero portfolio value.

## 3. Empty States
- No strategies → CTA to create
- No backtests → prompt to run first test
- Completed backtest with no trades → keep metrics/curve visible and explain
  that no positions met the strategy conditions
- No positions → explain portfolio

## 4. Error States
- Backtest failure → error message + retry
- Expired/missing local session → redirect protected routes to `/login`
- Insufficient balance / risk limits → persisted reject with reason
- Idempotency-key payload mismatch → show conflict and generate a new client id
- Missing/stale valuation price → show unavailable-price state; do not show zero
