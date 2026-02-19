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

---

## Epic 5.1 – Backtest Run Model & Persistence

### Story 5.1.1 – Backtest run schema
### Story 5.1.2 – Backtest result storage
### Story 5.1.3 – Trades & equity curve storage

---

## Epic 5.2 – Backtest Engine Core

### Story 5.2.1 – Engine interface
### Story 5.2.2 – Indicator computation layer
### Story 5.2.3 – Rule evaluation
### Story 5.2.4 – Trade simulation logic
### Story 5.2.5 – Stop loss / take profit handling

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

