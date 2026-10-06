# BitStockerz – MVP Feature List

This list preserves the original MVP scope.
The [roadmap](ROADMAP.md) records delivery; [product extensions](PRODUCT_EXTENSIONS.md) describe subsequent local additions.
MVP code is merged, but hosting, licensed data, and production/provider tests remain launch requirements.
See the [remaining checklist](../../PRODUCT_TASKLIST.md).

## 1. User & Account

- Passkeys (WebAuthn) / OAuth login
- Profile/display-name settings and recovery through an already linked provider
- Single paper trading account
- Operator-configurable starting balance. Local extensions add confirmed reset with archives; arbitrary user balance editing remains unsupported.

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
