# BitStockerz MVP – 8) Backend & Infrastructure (Stories)

This document defines the epics and user stories for the **Backend & Infrastructure** layer of the BitStockerz MVP.

Scope:
- Backtest job execution & orchestration
- Execution engine hosting & resource limits
- Error handling and domain error model
- Logging, metrics, and basic observability
- Environment configuration and feature flags
- Minimal background job & health infrastructure
- Deployment & hosting (single region)

This is a **cross-cutting** technical foundation used by features #2–#7.

Dependencies:
- #2 Market Data
- #3 Paper Trading
- #4 Strategy Lab
- #5 Backtesting
- #6 Kernel (AI Assistant)

## Status

- Completed in Sprint 0.1 (February 19, 2026): #8.3.1 – Standardized API error response format
- Completed in Sprint 0.1 (February 19, 2026): #8.4.1 – Structured logging baseline and correlation IDs
- Completed in Sprint 0.1 (February 19, 2026): #8.5.1 – Central configuration service
- Completed in Sprint 0.1 (February 19, 2026): #8.6.2 – Health and readiness endpoints for core services
- Completed in Sprint 1.3 (July 11, 2026): #8.1.1 – Job model & lifecycle, #8.1.2 – Synchronous executor, #8.1.3 – Job timeout handling, #8.6.1 – Scheduled jobs
- Completed in Sprint 1.4 (July 24, 2026): #8.4.2 – Performance metrics foundation, #8.4.3 – Audit trail
- Completed in Sprint 3.1 (July 28, 2026): #8.2.1 – Logical execution sandbox boundaries, #8.2.2 – Runtime and memory limits per backtest
- Extended in Sprint 3.3 (July 28, 2026): bounded backtest logs, terminal
  counts/durations, backtest-domain errors, request diagnostics, and
  `backtest.requested` audit metadata.

---

## Epic 8.1 – Backtest Job Execution & Orchestration

### Story 8.1.1 – Backtest job model & status lifecycle
Acceptance criteria:
- `jobs` table stores `job_type`, `user_id`, `payload_json`, `status`, timestamps, and optional `error_message`.
- Lifecycle statuses: `pending` → `running` → `completed` | `failed` | `timed_out`.
- In-memory job store mirrors Prisma behavior when `DATABASE_URL` is unset.

### Story 8.1.2 – Synchronous executor (async-ready design)
Acceptance criteria:
- `JobExecutorService` runs registered handlers inline in the API process.
- `POST /api/jobs` creates a job and executes it before returning the final status.

### Story 8.1.3 – Job timeout & cancellation rules
Acceptance criteria:
- Jobs exceeding `JOB_TIMEOUT_MS` (default 30000) are marked `timed_out`.
- Handler failures persist `error_message` and `failed` status.

---

## Epic 8.2 – Engine Hosting & Resource Limits

### Story 8.2.1 – Execution sandbox boundaries
Acceptance criteria:
- Strategy definitions remain data-only JSON; the engine never evaluates user
  code or accesses Prisma, HTTP, filesystem, or environment variables.
- The pure core is wrapped by an injectable Nest service configured through
  `AppConfigService`.
- This is explicitly a logical in-process sandbox, not OS-level isolation.
- BullMQ, worker threads, dynamic `Function`, and `eval` are outside Sprint 3.1.

### Story 8.2.2 – Runtime & memory limits per backtest
Acceptance criteria:
- Defaults are 10,000 bars, 250,000
  `bars × max(1, indicator_count)` series cells, and a 5,000 ms timeout.
- Oversized inputs fail before indicator allocation with distinct bar/resource
  codes; caller-provided limits may tighten but never raise configured caps.
- External cancellation and a monotonic deadline are checked cooperatively at
  least every 64 loop iterations, so synchronous CPU work does not rely only on
  an event-loop timer.
- A frozen one-year daily fixture completes under the two-second compute NFR.

---

## Epic 8.3 – Error Handling & Domain Errors

### Story 8.3.1 – Standardized API error response format
### Story 8.3.2 – Domain error types for trading, strategies, and backtests

---

## Epic 8.4 – Logging, Metrics & Observability

### Story 8.4.1 – Structured logging baseline and correlation IDs
### Story 8.4.2 – Basic performance metrics for backtests
Acceptance criteria (Sprint 1.4 foundation; backtest-specific counters activate in Milestone 3):
- In-process `MetricsService` records HTTP latency/errors and job duration by type.
- `GET /api/metrics` returns a JSON snapshot (not Prometheus exposition).
- No Prometheus/Grafana/OTel exporters in MVP.

### Story 8.4.3 – Minimal audit trail for critical actions
Acceptance criteria:
- `audit_events` table persisted when MySQL is enabled; in-memory ring buffer otherwise.
- Critical events recorded: `auth.register`, `auth.login`, `auth.logout`, `job.created`, `job.completed`, `job.failed`, `market_data.ingestion_requested`.
- Audit failures never fail the primary request path; payloads redact tokens/secrets.

---

## Epic 8.5 – Environment, Configuration & Feature Flags

### Story 8.5.1 – Central configuration service
Acceptance criteria:
- A single `AppConfigService` is the source of truth for runtime configuration in the API service.
- Configuration is grouped into typed domains (at minimum: server, logging, readiness, and external dependency endpoints).
- Startup fails fast with a clear validation error when environment variables are invalid (for example malformed integers, invalid log level, invalid URLs).
- Runtime code does not read `process.env` directly outside the config module/service.
- Configuration consumers (for example app bootstrap, logger setup, health/readiness checks) receive config via dependency injection.
- Unit tests cover default values, custom overrides, and validation failure paths.
### Story 8.5.2 – Feature flags for AI, limits, and experimental paths

---

## Epic 8.6 – Background Jobs & Health

### Story 8.6.1 – Scheduling for market-data and maintenance jobs
Acceptance criteria:
- Hourly cron (`0 * * * *`) runs `market_data_scheduled` jobs when `INGESTION_SCHEDULER_ENABLED=true` (default in development, disabled in test).
- Scheduled jobs use `JOBS_SYSTEM_USER_ID` (default system user seeded by migration).

### Story 8.6.2 – Health and readiness endpoints for core services
Acceptance criteria:
- `GET /api/health/live` returns `200` with `{ "status": "ok" }` when the process is alive.
- `GET /api/health/ready` returns structured readiness output that includes per-check status for core dependencies (at minimum: database and market data service).
- Readiness output includes an overall readiness flag and timestamp so operators can diagnose failures quickly.
- `GET /api/health/ready` returns `200` when configured dependencies are healthy and `503` when any configured core dependency is unavailable.
- If a dependency check is not configured, it is explicitly reported as `not_configured` instead of being silently omitted.
- Automated tests cover at least one ready scenario and one not-ready scenario.

---

## Epic 8.7 – Deployment & Hosting

### Story 8.7.1 – Deployment pipeline (CI build and deploy to target environment)
### Story 8.7.2 – Hosting environment (API, DB, and scheduled jobs in single region)

---

## Explicitly Out of Scope (MVP)

- Horizontal auto-scaling policies
- Distributed job queues or external workers
- Full observability stack (Prometheus/Grafana, etc.)
- Complex role-based access control (RBAC) and multi-tenant isolation
