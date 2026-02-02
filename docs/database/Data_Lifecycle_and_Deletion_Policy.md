# BitStockerz – Data Lifecycle & Deletion Policy

This document defines **how data is deleted, retained, or archived** in BitStockerz.
It is authoritative for **cascade vs soft delete** decisions and complements the ERD.

---

## Core Principles

- Prefer **soft delete** for user-visible entities
- Prefer **immutability** for trading, backtesting, and market data
- Avoid DB-level cascades unless data is strictly subordinate
- Retention and purge are **explicit maintenance jobs**, not user actions

---

## Users & Identity

### users
- **Delete type:** Soft delete
- **Implementation:** `deleted_at DATETIME NULL`
- **Behavior:**
  - On account deletion:
    - Set `deleted_at`
    - Anonymize PII (email, name)
    - Revoke authentication
- **Cascade:** NONE (no DB-level cascades)

### webauthn_credentials
- **Delete type:** User-managed (device removal) or account deletion
- **Behavior:**
  - Remove credentials when a device is revoked
  - On account deletion, revoke and delete credentials via application logic
- **Cascade:** NONE (no DB-level cascades)

---

## Market Data (Reference Data)

### symbols
- **Delete type:** Never deleted in normal operation
- **Behavior:** Use `is_active = false` for delisted symbols
- **Cascade:** NONE

### equity_daily_bars / crypto_daily_bars / crypto_hourly_bars
- **Delete type:** Never user-deleted
- **Behavior:** Append-only historical facts
- **Cascade:** NONE
- **Retention:** Admin-only maintenance if needed

---

## Paper Trading

### paper_accounts
- **Delete type:** Soft disable
- **Implementation:** `is_active BOOLEAN`
- **Cascade:** NONE

### orders
- **Delete type:** Never user-deleted
- **Behavior:** Historical order record
- **Cascade:** NONE

### executions
- **Delete type:** Never deleted
- **Behavior:** Source of truth for P&L
- **Cascade:** NONE

### positions
- **Delete type:** Never deleted
- **Behavior:** Derived state from executions
- **Cascade:** NONE

---

## Strategy Lab

### strategies
- **Delete type:** Soft delete
- **Implementation:** `is_active = false`
- **Cascade:** NONE

### strategy_versions
- **Delete type:** Never deleted
- **Behavior:** Immutable snapshots
- **Cascade:** NONE

---

## Backtesting

### backtest_runs
- **Delete type:** No user deletion
- **Behavior:** Immutable historical simulation
- **Cascade:** RESTRICT (admin-only cleanup)

### backtest_results
- **Delete type:** Dependent on backtest_runs
- **Cascade:** OPTIONAL CASCADE from backtest_runs

### backtest_trades
### backtest_equity_points
- **Delete type:** Dependent on backtest_runs
- **Cascade:** OPTIONAL CASCADE from backtest_runs

---

## AI / Kernel

### ai_usage
- **Delete type:** Retention-based purge
- **Retention:** 90–180 days recommended
- **Cascade:** NONE

---

## Infrastructure

### jobs
- **Delete type:** Maintenance purge
- **Behavior:** Delete completed jobs after retention window
- **FK rule:** `backtest_runs.job_id ON DELETE SET NULL`

### audit_events
- **Delete type:** Retention-based purge
- **Behavior:** Keep for security/debugging
- **Cascade:** NONE
- **Optional:** Nullify `user_id` after anonymization

---

## “Delete My Account” Summary

- users → soft delete + anonymize
- strategies → soft delete
- paper_accounts → disable
- trading, backtests, market data → retained
- AI usage / jobs / audit → retained then purged by policy

---

This policy must be enforced via:
- Application logic
- FK rules (`RESTRICT`, `SET NULL`)
- Background maintenance jobs
