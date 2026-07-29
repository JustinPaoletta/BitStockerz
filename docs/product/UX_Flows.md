# BitStockerz – UX Flows

These flows describe the user-facing behavior of the Angular application.

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
1. Open trading view
2. Select symbol
3. Place market order
4. Execute immediately
5. Update position & cash
6. Refresh portfolio UI

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
