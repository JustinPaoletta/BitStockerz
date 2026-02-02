# BitStockerz – Global Domain Model / ERD

This document is the **authoritative ERD (Entity–Relationship Definition)** for the BitStockerz MVP.
It is derived from stories **#1–#8** and is intended to be implementation-grade.

Use this to:
- Validate table relationships before coding
- Drive DB migrations
- Avoid duplicated or conflicting sources of truth

---

## 1. Domain Overview

Domains covered:
1. Auth / User
2. Market Data
3. Paper Trading
4. Strategy Lab
5. Backtesting
6. AI / Kernel
7. Infrastructure (Jobs, Audit)

---

## 2. Tables by Domain

### 2.1 Auth / User

#### users
- id (PK)
- email (UNIQUE)
- created_at
- updated_at
- deleted_at

#### webauthn_credentials
- credential_id (PK)
- user_id (FK → users.id)
- public_key
- sign_count
- transports
- aaguid
- created_at

---

### 2.2 Market Data

#### symbols
- id (PK)
- symbol (UNIQUE, case-insensitive)
- name
- asset_type (EQUITY | CRYPTO)
- exchange (nullable)
- currency
- base_asset (crypto only)
- quote_asset (crypto only)
- is_active
- created_at
- updated_at

#### equity_daily_bars
- id (PK)
- symbol_id (FK → symbols.id)
- date
- open
- high
- low
- close
- volume
- provider
- created_at
- UNIQUE(symbol_id, date)

#### crypto_daily_bars
- id (PK)
- symbol_id (FK → symbols.id)
- date
- open
- high
- low
- close
- volume
- provider
- created_at
- UNIQUE(symbol_id, date)

#### crypto_hourly_bars
- id (PK)
- symbol_id (FK → symbols.id)
- timestamp
- open
- high
- low
- close
- volume
- provider
- created_at
- UNIQUE(symbol_id, timestamp)

---

### 2.3 Paper Trading

#### paper_accounts
- id (PK)
- user_id (FK → users.id, UNIQUE)
- name
- base_currency
- starting_balance
- cash_balance
- created_at
- updated_at

#### orders
- id (PK)
- paper_account_id (FK → paper_accounts.id)
- symbol_id (FK → symbols.id)
- side (BUY | SELL)
- quantity
- order_type (MARKET)
- status (PENDING | FILLED | REJECTED | CANCELLED)
- avg_fill_price (nullable)
- reject_reason (nullable)
- client_order_id (nullable)
- requested_at
- filled_at (nullable)
- UNIQUE(paper_account_id, client_order_id)

#### executions
- id (PK)
- order_id (FK → orders.id)
- paper_account_id (FK → paper_accounts.id)
- symbol_id (FK → symbols.id)
- side
- quantity
- price
- executed_at

#### positions
- id (PK)
- paper_account_id (FK → paper_accounts.id)
- symbol_id (FK → symbols.id)
- quantity
- avg_cost
- updated_at
- UNIQUE(paper_account_id, symbol_id)

---

### 2.4 Strategy Lab

#### strategies
- id (PK)
- user_id (FK → users.id)
- name
- description
- asset_type
- symbol_scope
- timeframe
- is_active
- created_at
- updated_at
- UNIQUE(user_id, name)

#### strategy_versions
- id (PK)
- strategy_id (FK → strategies.id)
- version_number
- definition_json
- created_at
- UNIQUE(strategy_id, version_number)

---

### 2.5 Backtesting

#### backtest_runs
- id (PK)
- user_id (FK → users.id)
- strategy_id (FK → strategies.id)
- strategy_version_id (FK → strategy_versions.id)
- symbol_id (FK → symbols.id)
- timeframe
- start_date
- end_date
- initial_equity
- status
- job_id (FK → jobs.id)
- error_message
- created_at
- updated_at
- started_at
- finished_at

#### backtest_results
- id (PK)
- backtest_run_id (FK → backtest_runs.id, UNIQUE)
- final_equity
- total_return_pct
- max_drawdown_pct
- win_rate_pct
- num_trades
- avg_win_pct
- avg_loss_pct
- sharpe_ratio (nullable)

#### backtest_trades
- id (PK)
- backtest_run_id (FK → backtest_runs.id)
- symbol_id (FK → symbols.id)
- entry_time
- exit_time
- side
- entry_price
- exit_price
- quantity
- pnl_abs
- pnl_pct

#### backtest_equity_points
- id (PK)
- backtest_run_id (FK → backtest_runs.id)
- timestamp
- equity

---

### 2.6 AI / Kernel

#### ai_usage
- id (PK)
- user_id (FK → users.id)
- date
- calls
- UNIQUE(user_id, date)

---

### 2.7 Infrastructure

#### jobs
- id (PK)
- job_type
- user_id (FK → users.id)
- payload_json
- status
- error_message
- created_at
- started_at
- finished_at

#### audit_events
- id (PK)
- user_id (FK → users.id, nullable)
- event_type
- payload_json
- created_at

---

## 3. Relationship Summary

- users 1–1 paper_accounts
- users 1–N webauthn_credentials
- users 1–N strategies
- strategies 1–N strategy_versions
- strategy_versions 1–N backtest_runs
- users 1–N backtest_runs
- backtest_runs 1–1 backtest_results
- backtest_runs 1–N backtest_trades
- backtest_runs 1–N backtest_equity_points
- users 1–N jobs
- users 1–N audit_events
- users 1–N ai_usage
- paper_accounts 1–N orders
- orders 1–N executions
- paper_accounts 1–N positions
- symbols 1–N (market data, orders, executions, positions, backtests)

---

## 4. Key Design Guarantees

- Strategy versions are immutable and pinned to backtests
- Market data is append-only historical fact
- Paper trading and backtesting are fully isolated paths
- Symbols are the single instrument source of truth
- Executions are the only source of truth for positions and cash
- Jobs and audit tables support observability and debugging

---

**File:** BitStockerz_ERD.md


## 5. Lifecycle & Deletion Overview

This ERD defines **structure only**. For how data is deleted, retained, or anonymized, see:

- `../Data_Lifecycle_and_Deletion_Policy.md`

Key points (summary):
- `users` are **soft-deleted** (PII scrubbed; no cascades).
- `strategies` are **soft-deleted** via `is_active`, strategy_versions remain immutable.
- Market data (`symbols`, `*_bars`) is **never user-deleted**; only admin maintenance.
- Trading and backtest records (`orders`, `executions`, `positions`, `backtest_*`) are treated as **historical facts**, not user-deletable content.
- Infra tables (`jobs`, `audit_events`, `ai_usage`) follow retention policies defined in the lifecycle document.

Foreign key `ON DELETE` behavior and retention rules are governed by `../Data_Lifecycle_and_Deletion_Policy.md`.


---

## Lifecycle & Deletion Policy

This ERD defines **structure only**.

All deletion, retention, and cascade rules are defined in:

**../Data_Lifecycle_and_Deletion_Policy.md**

This includes:
- Soft delete vs hard delete
- Retention windows
- FK cascade vs restrict rules
- “Delete my account” behavior
