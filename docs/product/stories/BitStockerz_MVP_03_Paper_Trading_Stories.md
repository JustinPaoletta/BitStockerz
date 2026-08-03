# BitStockerz MVP – 3) Paper Trading (Stories)

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
- The shipped backend supports default accounts, long-only fractional market
  BUY/SELL fills, fixed-scale cash and average-cost positions, persisted
  terminal rejections, configurable risk limits, semantic idempotency,
  portfolio unrealized P&L, and owner-scoped order/execution history.
- Angular trading/dashboard workflows remain owned by Milestones 5.2–5.3.
- Realized-P&L aggregation, shorts/margin, account reset, and non-market order
  types remain explicitly outside the Milestone 4 contract.

---

## Epic 3.1 – Paper Trading Account Model

### Story 3.1.1 – Paper trading account table
Persistent paper account per user with starting balance and cash tracking.

**Acceptance criteria (completed)**
- One `paper_accounts` row per user (`UNIQUE user_id`) with $100,000.00 USD
  starting/cash balance and active lifecycle state.
- Signup provisioning and lazy reads are idempotent; MySQL ownership survives
  same-email registration after restart.
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

### Story 3.4.2 – Portfolio summary & unrealized P&L

- `GET /api/trading/portfolio-summary` returns 2dp cash, position value,
  equity, and unrealized P&L using the same close rules as fills.
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

- Same account/client id plus the same normalized symbol/side/quantity returns
  the original order without another fill; a different payload returns
  `409 CONFLICT`; concurrent MySQL races converge on one execution.
