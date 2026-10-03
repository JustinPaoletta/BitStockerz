# BitStockerz – MVP Feature List

This is the complete MVP **target**, not a list of features already shipped.
For current implementation state and the next development owner, use the
[roadmap](./ROADMAP.md). Original Milestones 0–7 are complete in-repo.
As of October 2, 2026, realized/total paper P&L, backtest entry/exit markers,
Google/Apple browser login and profile/account recovery are merged in
[PR #13](https://github.com/JustinPaoletta/BitStockerz/pull/13), with passing CI under
[Sprint 8.1](../plans/sprint-8-1-oauth-browser-readiness.md) and
[Sprint 8.2](../plans/sprint-8-2-profile-recovery.md). Live deployment still
requires hosting, a database, credentials, real market data and production smoke
checks. No production hosting is provisioned. AI diff-style suggestions remain deferred.

## 1. User & Account
- Passkeys (WebAuthn) / OAuth login
- Profile/display-name settings and recovery through an already linked provider
- Single paper trading account
- Operator-configurable starting balance; no per-user reset/balance-edit UI

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
