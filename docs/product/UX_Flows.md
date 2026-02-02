# BitStockerz – UX Flows

## 1. Strategy → Backtest Flow
1. Create strategy
2. Save strategy
3. Select timeframe & symbol
4. Run backtest
5. Show loading state
6. Display results (metrics, trades, equity curve)

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
- No positions → explain portfolio

## 4. Error States
- Backtest failure → error message + retry
- Insufficient balance → block trade with explanation
