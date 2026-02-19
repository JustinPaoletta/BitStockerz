# BitStockerz – Per-Sprint Migration Plan

This document maps **sprints** from `../product/ROADMAP.md` to concrete **database migrations**.
Migrations are defined in terms of the domain DDL skeletons:

- `DDL/00_core.sql`
- `DDL/01_market_data.sql`
- `DDL/02_trading.sql`
- `DDL/03_strategy_lab.sql`
- `DDL/04_backtesting.sql`
- `DDL/05_ai_kernel.sql`
- `DDL/06_infra.sql`

Each sprint lists:
- Migration file name (suggested)
- Tables created/modified
- Source DDL file

---

## Sprint 0.1 – Core Infra + Auth Skeleton

**Migrations**

1. `V0001__create_users.sql`  
   - Creates: `users`  
   - Source: `DDL/00_core.sql`

2. `V0002__create_webauthn_credentials.sql`  
   - Creates: `webauthn_credentials`  
   - Source: `DDL/00_core.sql`

---

## Sprint 1.1 – Symbols & Schemas

**Migrations**

1. `V0100__create_symbols.sql`  
   - Creates: `symbols`  
   - Source: `DDL/01_market_data.sql`

2. `V0101__create_equity_daily_bars.sql`  
   - Creates: `equity_daily_bars`  
   - Source: `DDL/01_market_data.sql`

3. `V0102__create_crypto_daily_bars.sql`  
   - Creates: `crypto_daily_bars`  
   - Source: `DDL/01_market_data.sql`

4. `V0103__create_crypto_hourly_bars.sql`  
   - Creates: `crypto_hourly_bars`  
   - Source: `DDL/01_market_data.sql`

Apply in this order after Sprint 0.1 migrations (`V0001`–`V0002`).

---

## Sprint 1.2 – Market Data Read APIs

**Migrations**

- No new tables required.  
- This sprint uses data from:
  - `symbols`
  - `equity_daily_bars`
  - `crypto_daily_bars`
  - `crypto_hourly_bars`

You may add **indexes** later if query patterns demand it.

---

## Sprint 1.3 – Data Ingestion & Jobs

**Migrations**

1. `V0130__create_jobs.sql`  
   - Creates: `jobs`  
   - Source: `DDL/06_infra.sql`

No new core tables for ingestion are required beyond `jobs`.  
You might add helper tables later if needed (e.g., import checkpoints), but MVP can track that in `jobs.payload_json`.

---

## Sprint 1.4 – Data Health & Observability

**Migrations**

1. `V0131__create_audit_events.sql`  
   - Creates: `audit_events`  
   - Source: `DDL/06_infra.sql`

No new core tables are required for metrics/health endpoints beyond `audit_events`.

---

## Sprint 2.1 – Strategy Persistence & Versioning

**Migrations**

1. `V0200__create_strategies.sql`  
   - Creates: `strategies`  
   - Source: `DDL/03_strategy_lab.sql`

2. `V0201__create_strategy_versions.sql`  
   - Creates: `strategy_versions`  
   - Source: `DDL/03_strategy_lab.sql`

Run after Sprint 1 migrations.

---

## Sprint 2.2 – Indicators & Rule Schema

**Migrations**

- No new tables required.  
- All indicator/condition structures live in `strategy_versions.definition_json`.

---

## Sprint 2.3 – Strategy CRUD & Validation

**Migrations**

- No new tables required.  
- You may add non-critical indexes later if needed (e.g., `idx_strategies_user`).

---

## Sprint 3.1 – Backtest Engine Core

**Migrations**

- No new tables yet. This sprint is engine logic only, operating in memory.

---

## Sprint 3.2 – Backtest Persistence

**Migrations**

1. `V0300__create_backtest_runs.sql`  
   - Creates: `backtest_runs`  
   - Source: `DDL/04_backtesting.sql` (table definition only; FK to `jobs` added later via `V0330__add_fk_backtest_runs_job.sql`).

2. `V0301__create_backtest_results.sql`  
   - Creates: `backtest_results`  
   - Source: `DDL/04_backtesting.sql`

3. `V0302__create_backtest_trades.sql`  
   - Creates: `backtest_trades`  
   - Source: `DDL/04_backtesting.sql`

4. `V0303__create_backtest_equity_points.sql`  
   - Creates: `backtest_equity_points`  
   - Source: `DDL/04_backtesting.sql`

5. `V0330__add_fk_backtest_runs_job.sql`  
   - Alters: `backtest_runs` to add FK to `jobs.id` (`ON DELETE SET NULL`).  
   - Source: `DDL/04_backtesting.sql` (constraint only).

Note: If your migration tool requires strict FK ordering with `jobs`, ensure `V0130__create_jobs.sql` runs before `V0330__add_fk_backtest_runs_job.sql`.  
If you prefer, you can omit the FK initially and add `V0330` later once jobs exist.

---

## Sprint 3.3 – Backtest Execution & Limits

**Migrations**

- No new tables.  
- Optional: add indexes if profiling requires it (e.g., `idx_backtests_user_created`).

---

## Sprint 3.4 – Backtest UI

**Migrations**

- No schema changes.

---

## Sprint 4.1 – Accounts & Positions

**Migrations**

1. `V0400__create_paper_accounts.sql`  
   - Creates: `paper_accounts`  
   - Source: `DDL/02_trading.sql`

2. `V0401__create_positions.sql`  
   - Creates: `positions`  
   - Source: `DDL/02_trading.sql`

---

## Sprint 4.2 – Orders & Executions

**Migrations**

1. `V0402__create_orders.sql`  
   - Creates: `orders`  
   - Source: `DDL/02_trading.sql`

2. `V0403__create_executions.sql`  
   - Creates: `executions`  
   - Source: `DDL/02_trading.sql`

---

## Sprint 4.3 – Trading Views

**Migrations**

- No new tables; APIs read from `paper_accounts`, `positions`, `orders`, `executions`.

---

## Sprint 5.1 – Shell & Navigation

**Migrations**

- No backend schema changes (frontend-only sprint).

---

## Sprint 5.2 – Dashboard Widgets

**Migrations**

- No new tables.  
- Optional future indexes if dashboard queries expose new hot paths.

---

## Sprint 6.1 – AI Infrastructure

**Migrations**

1. `V0600__create_ai_usage.sql`  
   - Creates: `ai_usage`  
   - Source: `DDL/05_ai_kernel.sql`

---

## Sprint 6.2 – Strategy Intelligence

**Migrations**

- No schema changes; AI operates on existing strategy and backtest tables.

---

## Sprint 6.3 – Backtest Intelligence

**Migrations**

- No schema changes; AI operates on existing backtest tables.

---

## Sprint 7.1 – Polish & Caching

**Migrations**

- No new core tables.  
- Optional: index tuning and cache-related metadata tables if needed (MVP can avoid).

---

## Migration Ordering Summary

Suggested global migration order (flattened):

1. `V0001__create_users.sql`
2. `V0002__create_webauthn_credentials.sql`
3. `V0100__create_symbols.sql`
4. `V0101__create_equity_daily_bars.sql`
5. `V0102__create_crypto_daily_bars.sql`
6. `V0103__create_crypto_hourly_bars.sql`
7. `V0130__create_jobs.sql`
8. `V0131__create_audit_events.sql`
9. `V0200__create_strategies.sql`
10. `V0201__create_strategy_versions.sql`
11. `V0300__create_backtest_runs.sql`
12. `V0301__create_backtest_results.sql`
13. `V0302__create_backtest_trades.sql`
14. `V0303__create_backtest_equity_points.sql`
15. `V0330__add_fk_backtest_runs_job.sql`
16. `V0400__create_paper_accounts.sql`
17. `V0401__create_positions.sql`
18. `V0402__create_orders.sql`
19. `V0403__create_executions.sql`
20. `V0600__create_ai_usage.sql`

Index-only changes can be added as separate migrations (`VXXXX__add_indexes_*.sql`) when profiling justifies them.
