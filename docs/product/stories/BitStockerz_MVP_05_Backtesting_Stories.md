# BitStockerz MVP – 5) Backtesting (Stories)

This document defines the epics and user stories for the **Backtesting** module of the BitStockerz MVP.

Scope:
- Run a single strategy on a single symbol
- Use historical market data (daily or hourly)
- Simulate long-only trades
- Persist results, trades, and equity curves
- Display performance metrics and charts

Dependencies:
- #2 Market Data
- #4 Strategy Lab

## Status

- Completed in Sprint 3.1 (July 28, 2026): #5.2.1–#5.2.5.
- Planned next in Sprint 3.2: #5.1.1–#5.1.3 and #5.6.1.
- HTTP execution APIs and result UI remain planned for Sprints 3.3–3.4.

---

## Epic 5.1 – Backtest Run Model & Persistence

### Story 5.1.1 – Backtest run schema
### Story 5.1.2 – Backtest result storage
### Story 5.1.3 – Trades & equity curve storage

---

## Epic 5.2 – Backtest Engine Core

### Story 5.2.1 – Engine interface
Acceptance criteria:
- A pure synchronous engine accepts a canonical Strategy Lab definition,
  strictly ascending finite OHLCV bars, positive initial equity, optional
  symbol id/cancellation, and bounded execution limits.
- Output contains closed long trades, exactly one equity point per processed
  bar, summary metrics, and bounded diagnostics.
- Empty/short, malformed, duplicate-timestamp, and unsorted bar inputs fail
  closed with stable `BACKTEST_*` domain codes.
- Identical definitions and bars produce identical trades, curves, and metrics;
  only measured diagnostic duration may vary.

### Story 5.2.2 – Indicator computation layer
Acceptance criteria:
- Pure aligned series support SMA, EMA, and Wilder RSI with null warmup values
  and the Strategy Lab source restrictions.
- EMA seeds from the first period SMA. RSI requires one initial change window;
  flat windows resolve to 50 and zero-loss/zero-gain windows resolve to 100/0.
- Invalid periods, types, sources, ids, and duplicate ids fail closed.

### Story 5.2.3 – Rule evaluation
Acceptance criteria:
- AND-only groups support `gt`, `gte`, `lt`, `lte`, relative-epsilon `eq`,
  `crosses_above`, and `crosses_below`.
- Operands resolve indicator ids, OHLC prices, or finite `literal` values.
- Crosses use current and previous values, return false through null warmup, and
  require at least one dynamic operand.

### Story 5.2.4 – Trade simulation logic
Acceptance criteria:
- Simulation is single-symbol, long-only, one position maximum, and invests
  100% of current equity with zero fees/slippage.
- Signals fill at the signal-bar close. An open final position force-closes at
  the last close; an exit never re-enters on that same bar.
- Equity is marked to market once per bar. Trade percentages use percentage
  points; average loss remains negative and max drawdown is a positive
  magnitude.
- Metrics include return, drawdown, win rate, trade count, average win/loss,
  and non-annualized per-bar Sharpe (`null` when undefined).

### Story 5.2.5 – Stop loss / take profit handling
Acceptance criteria:
- Percent stop loss and take profit use intrabar low/high beginning on the bar
  after entry and fill at their exact threshold.
- Risk exits run before signal exits. If a bar touches both thresholds, stop
  loss wins; no same-bar re-entry occurs.
- Persisted definitions support the Strategy Lab 500% take-profit ceiling;
  absent legacy risk fields are skipped defensively.

---

## Epic 5.3 – Backtest Execution APIs

### Story 5.3.1 – Run backtest
### Story 5.3.2 – List backtest runs
### Story 5.3.3 – Backtest detail view

---

## Epic 5.4 – Backtest Results UI

### Story 5.4.1 – Equity curve chart
### Story 5.4.2 – Trades table

---

## Epic 5.5 – Performance & Limits

### Story 5.5.1 – Bar count limits
### Story 5.5.2 – Logging & diagnostics

---

## Epic 5.6 – Reproducibility

### Story 5.6.1 – Strategy version pinning
