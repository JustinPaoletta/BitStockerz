# BitStockerz – UX Flows

These flows describe the user-facing behavior of the Angular application.

The Strategy → Backtest flow is implemented through Sprint 3.4. The paper
trading backend flow is implemented through Sprint 4.3; Milestones 5.2–5.3 add
its Angular dashboard and trade-ticket presentation.

## 1. Strategy → Backtest Flow
1. Create and save a strategy through the Strategy API. The full Strategy Lab
   UI remains owned by Sprint 5.3; Sprint 3.4 exposes a `/strategies`
   placeholder and accepts a strategy id on the run form.
2. Use the development login/register screen at `/login`.
3. Open `/backtests/new`, enter the strategy id, symbol, timeframe, inclusive
   date range, and initial equity.
4. Submit the synchronous run and show a disabled/loading submit state.
5. Navigate to `/backtests/:id` when execution completes.
6. Display result metrics, a responsive equity curve, and the first stable-id
   page of real trades. Load additional trades only while
   `trades_page.has_more` is true.
7. `/backtests` lists owned runs and links each run to its result detail.

Sprint 3.4 uses the relative `/api` development proxy and stores the bearer
token in `sessionStorage`. Sprint 5.1 hardens the guard with `/auth/me` session
validation and expands the shell; it does not re-scaffold the app.

## 2. Paper Trading Flow
1. A successful signup provisions one $100,000.00 USD paper account.
2. The future Angular trading view selects an active symbol and submits a
   decimal-string market BUY/SELL with a unique client id.
3. The API fills immediately at the latest eligible close, or returns a
   persisted `REJECTED` order explaining the business rule.
4. Filled cash, average-cost position, execution, and order state commit as
   one transaction; replaying the same client id does not fill again.
5. Refresh the account, current positions, portfolio summary, recent orders,
   and execution history independently.
6. Empty positions render an empty-state; unavailable held-symbol prices show
   a valuation error rather than a misleading zero portfolio value.

## 3. Empty States
- No strategies → CTA to create
- No backtests → prompt to run first test
- Completed backtest with no trades → keep metrics/curve visible and explain
  that no positions met the strategy conditions
- No positions → explain portfolio

## 4. Error States
- Backtest failure → error message + retry
- Expired/missing local session → redirect protected backtest routes to `/login`
- Insufficient balance → block trade with explanation
- Idempotency-key payload mismatch → show conflict and generate a new client id
- Missing/stale valuation price → show unavailable-price state; do not show zero
