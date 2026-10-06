# BitStockerz MVP – 3) Paper Trading (Stories)

This file retains original story acceptance criteria and dated delivery notes.
[Product extensions](../PRODUCT_EXTENSIONS.md) describe October 4 additions; [the task list](../../../PRODUCT_TASKLIST.md) contains unfinished acceptance checks.

This document defines the epics and user stories for **Paper Trading** in the BitStockerz MVP.
Scope includes:

- Simulated trading accounts
- Market orders (buy/sell)
- Positions, executions, and cash balance tracking
- Basic portfolio value and P&L
- Order and trade history
- Minimal guardrails

## Status

- Completed across Sprints 4.1–4.3 (verified August 2, 2026) in both in-memory
  seed and MySQL modes.
- The backend supports default accounts, long-only fractional BUY/SELL fills, fixed-scale cash, average-cost positions, and persisted terminal rejections.
  It adds configurable risk limits, semantic idempotency, portfolio unrealized P&L, and owned order/execution history.
- Angular Trade desk and dashboard portfolio/position widgets shipped in
  Milestone 5 / PR #11.
- Prelaunch follow-up (merged in PR #13, October 2, 2026): cumulative realized and total P&L
  implemented in the portfolio summary, dashboard, and Trade desk.
- Shorts/margin, account reset, and non-market order types remain outside scope.

---

## Epic 3.1 – Paper Trading Account Model

### Story 3.1.1 – Paper trading account table

Persistent paper account per user with starting balance and cash tracking.

**Acceptance criteria (completed)**

- One `paper_accounts` row per user (`UNIQUE user_id`) with $100,000.00 USD
  starting/cash balance and active lifecycle state.
- Signup provisioning and lazy reads are idempotent; MySQL ownership survives
  signing in to the same persisted user after restart. Duplicate signup is not a
  recovery mechanism.
- `GET /api/paper-account` returns owner-only snake-case fixed-scale data.

---

## Epic 3.2 – Orders

### Story 3.2.1 – Order schema (market orders only)

**Acceptance criteria (completed)**

- UUID market orders persist side, 8dp quantity, terminal status, optional
  fill/reject data, request/fill timestamps, and an account-scoped optional
  `client_order_id` unique key.

### Story 3.2.2 – Place market order API

**Acceptance criteria (completed)**

- Authenticated `POST /api/trading/orders` accepts active symbols, BUY/SELL,
  positive decimal-string quantity, and optional trimmed client id.
- Eligible orders fill synchronously at the latest fresh close; cash,
  positions, execution, and terminal order commit atomically.
- Business failures persist and return a `200` `REJECTED` order; invalid DTO,
  auth, symbol, account, and idempotency-conflict failures use RFC 7807.

---

## Epic 3.3 – Executions, Positions, and Cash

### Story 3.3.1 – Execution representation

- A full fill creates exactly one execution record; rejects create none.

### Story 3.3.2 – Positions table and update logic

- BUY opens/adds using an 8dp weighted average; SELL preserves average cost,
  prevents shorts, and removes the position at zero.

### Story 3.3.3 – Cash balance updates

- Cash notional uses `ROUND_HALF_UP` at 2dp. BUY debits, SELL credits, and
  direct insufficient-cash/position attempts fail before partial commit.

---

## Epic 3.4 – Portfolio & P&L

### Story 3.4.1 – Get current positions

- `GET /api/trading/positions` returns owner-only non-zero positions ordered
  by symbol with 8dp quantity and average cost.

### Story 3.4.2 – Portfolio summary & realized/unrealized P&L

- `GET /api/trading/portfolio-summary` returns 2dp cash, position value,
  equity, `unrealized_pnl_total`, `realized_pnl_total`, and `total_pnl` using the
  same close rules as fills.
- Cumulative realized P&L equals cash plus remaining average-cost basis minus
  starting balance, including cash-rounding residuals from fractional fills.
  It does not depend on current market prices or history pagination. Existing
  trades are included automatically, including after an API restart.
- Total P&L equals equity minus starting balance. Displayed unrealized P&L is
  total minus realized so all three 2dp totals reconcile exactly. Cash and
  positions come from one consistent ledger snapshot.
- This identity assumes the current fill-only account model. Deposits,
  withdrawals, resets, or funding adjustments require explicit cash-flow accounting
  before adding them; they must not be counted as trading profits.
- Missing/stale prices fail closed with `422 TRADING_NO_MARKET_PRICE`.

---

## Epic 3.5 – Trade & Order History

### Story 3.5.1 – List recent orders

- `GET /api/trading/orders` supports validated status/symbol filters and
  bounded offset paging in stable newest-first order.

### Story 3.5.2 – Trade history

- `GET /api/trading/executions` returns fills only with symbol, side, 8dp
  quantity/price, 2dp notional, and bounded stable paging.

---

## Epic 3.6 – Guardrails & Validation

### Story 3.6.1 – Risk limits

- Environment-configurable max order notional ($25,000), max resulting symbol
  position (25% of pre-trade equity), and minimum remaining cash ($0) persist
  stable rejection reasons. Held-symbol valuation fails closed.

### Story 3.6.2 – Idempotent order submission

- The same account/client id and normalized symbol/side/quantity return the original order without another fill.
  A different payload returns `409 CONFLICT`. Concurrent MySQL races converge on one execution.
