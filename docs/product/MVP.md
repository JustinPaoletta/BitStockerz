# BitStockerz – MVP Feature List

This is the complete MVP **target**, not a list of features already shipped.
For current implementation state and the next development owner, use the
[roadmap](./ROADMAP.md). As of August 1, 2026, Sprints 2.1–3.4 are implemented
locally in draft PR #9 and Sprint 4.1 is next; paper trading, the complete
dashboard/workflow UI, AI assistance, and backtest entry/exit chart markers
remain future work.

## 1. User & Account
- Passkeys (WebAuthn) / OAuth login
- Single paper trading account
- Configurable starting balance

---

## 2. Market Data
- Historical price data (OHLCV)
- Stocks: daily candles
- Crypto: daily or hourly candles
- Symbol search & selection

---

## 3. Paper Trading Engine
- Market buy / sell orders
- Position tracking
- Portfolio value calculation
- Realized & unrealized P&L
- Trade history log

---

## 4. Strategy Lab
- Rule-based strategy builder
  - Indicators (SMA, EMA, RSI)
  - Entry conditions
  - Exit conditions
  - Stop loss / take profit
- Parameter inputs (numbers, sliders)
- Save & load strategies

---

## 5. Backtesting
- Run strategy on historical data
- Equity curve chart
- Entry / exit markers
- Performance metrics:
  - Total return
  - Max drawdown
  - Win rate
  - Trade count
  - Sharpe ratio (optional)

---

## 6. Kernel (AI Assistant)
- Explain strategy results
- Explain metrics in plain English
- Flag obvious issues:
  - Overfitting
  - Too few trades
  - High drawdown
- Suggest parameter tweaks

---

## 7. Dashboard / UI
- Angular application frontend
- Portfolio summary
- Active strategies list
- Recent trades
- Strategy performance snapshots

---

## 8. Backend / Infrastructure
- Strategy execution engine
- Backtest job processing
- Persistent storage (users, strategies, results)
- Basic error handling & logging
- Single-region deployment / hosting (API, DB, scheduled jobs)
