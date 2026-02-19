# BitStockerz MVP – 3) Paper Trading (Stories)

This document defines the epics and user stories for **Paper Trading** in the BitStockerz MVP.
Scope includes:
- Simulated trading accounts
- Market orders (buy/sell)
- Positions, executions, and cash balance tracking
- Basic portfolio value and P&L
- Order and trade history
- Minimal guardrails

---

## Epic 3.1 – Paper Trading Account Model

### Story 3.1.1 – Paper trading account table
Persistent paper account per user with starting balance and cash tracking.

---

## Epic 3.2 – Orders

### Story 3.2.1 – Order schema (market orders only)
### Story 3.2.2 – Place market order API

---

## Epic 3.3 – Executions, Positions, and Cash

### Story 3.3.1 – Execution representation
### Story 3.3.2 – Positions table and update logic
### Story 3.3.3 – Cash balance updates

---

## Epic 3.4 – Portfolio & P&L

### Story 3.4.1 – Get current positions
### Story 3.4.2 – Portfolio summary & unrealized P&L

---

## Epic 3.5 – Trade & Order History

### Story 3.5.1 – List recent orders
### Story 3.5.2 – Trade history

---

## Epic 3.6 – Guardrails & Validation

### Story 3.6.1 – Risk limits
### Story 3.6.2 – Idempotent order submission
