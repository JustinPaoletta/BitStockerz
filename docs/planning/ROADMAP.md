# BitStockerz – Implementation Roadmap (Sprint → Story Mapping)

This roadmap maps **every sprint to concrete story IDs** from the MVP documents (#1–#8).
It is explicit enough to drop directly into Jira / Linear / GitHub Projects.

Assumptions:
- 1–2 week sprints
- Small team (1–3 engineers)
- Stories referenced exactly as numbered in the MVP docs

---

## Milestone 0 – Platform Foundation

### Sprint 0.1 – Core Infra + Auth Skeleton

**Stories**
- #8.3.1 – Standardized API error response format
- #8.4.1 – Structured logging & correlation IDs
- #8.5.1 – Central configuration service
- #8.6.2 – Health & readiness endpoints
- #1.1.x – User registration & authentication (minimal)
- #1.2.x – User profile access

**Exit**
- Authenticated API requests
- Global error/logging pattern enforced

---

## Milestone 1 – Market Data Core

### Sprint 1.1 – Symbols & Schemas

**Stories**
- #2.1.1 – Equity symbol directory
- #2.1.2 – Crypto symbol directory
- #2.2.1 – Equity daily OHLCV schema
- #2.3.1 – Crypto daily/hourly OHLCV schema

---

### Sprint 1.2 – Market Data Read APIs

**Stories**
- #2.2.3 – Equity daily candles API
- #2.3.3 – Crypto candles API
- #2.4.1 – Symbol search API

**Exit**
- Candles retrievable for stocks and crypto
- Symbol search working

---

### Sprint 1.3 – Data Ingestion & Jobs

**Stories**
- #2.2.2 – Equity history import
- #2.3.2 – Crypto import & incremental updates
- #8.1.1 – Job model & lifecycle
- #8.1.2 – Synchronous executor
- #8.1.3 – Job timeout handling
- #8.6.1 – Scheduled jobs

**Exit**
- Market data ingestion runnable on a schedule
- Jobs infrastructure usable by backtesting and other domains

---

### Sprint 1.4 – Data Health & Observability

**Stories**
- #2.6.1 – Market data sanity checks
- #2.6.2 – Market data health endpoint
- #8.4.2 – Performance metrics
- #8.4.3 – Audit logging

**Exit**
- Market data pipelines are observable and verifiable

---

## Milestone 2 – Strategy Lab Core

### Sprint 2.1 – Strategy Persistence & Versioning

**Stories**
- #4.1.1 – Strategy schema
- #4.1.2 – Strategy versioning

---

### Sprint 2.2 – Indicators & Rule Schema

**Stories**
- #4.2.1 – Indicator catalog
- #4.3.1 – Condition schema
- #4.3.2 – Entry rules (AND-only)
- #4.3.3 – Exit rules (AND-only)

---

### Sprint 2.3 – Strategy CRUD & Validation

**Stories**
- #4.5.1 – Create strategy
- #4.5.2 – Update strategy
- #4.5.3 – List strategies
- #4.5.4 – Get strategy details
- #4.5.5 – Delete strategy
- #4.6.1 – Strategy validation endpoint

**Exit**
- Users can create and manage valid strategies

---

## Milestone 3 – Backtesting Engine (Critical Path)

### Sprint 3.1 – Backtest Engine Core

**Stories**
- #5.2.1 – Engine interface
- #5.2.2 – Indicator computation layer
- #5.2.3 – Rule evaluation
- #5.2.4 – Trade simulation logic
- #5.2.5 – Stop loss / take profit handling
- #8.2.1 – Execution sandbox boundaries

---

### Sprint 3.2 – Backtest Persistence

**Stories**
- #5.1.1 – Backtest run schema
- #5.1.2 – Backtest result storage
- #5.1.3 – Trades & equity curve storage

---

### Sprint 3.3 – Backtest Execution & Limits

**Stories**
- #5.3.1 – Run backtest API
- #5.3.2 – List backtest runs
- #5.3.3 – Backtest details API
- #5.5.1 – Bar count limits

---

### Sprint 3.4 – Backtest UI

**Stories**
- #5.4.1 – Equity curve chart
- #5.4.2 – Trades table

**Exit**
- Strategy → Backtest → Results fully demoable

---

## Milestone 4 – Paper Trading

### Sprint 4.1 – Accounts & Positions

**Stories**
- #3.1.1 – Paper trading account
- #3.3.2 – Positions table & logic
- #3.3.3 – Cash balance updates

---

### Sprint 4.2 – Orders & Executions

**Stories**
- #3.2.1 – Order schema
- #3.2.2 – Place market order
- #3.3.1 – Execution records
- #3.6.1 – Risk limits

---

### Sprint 4.3 – Trading Views

**Stories**
- #3.4.1 – Current positions API
- #3.4.2 – Portfolio summary
- #3.5.1 – Recent orders
- #3.5.2 – Trade history

**Exit**
- Users can simulate trades with correct P&L

---

## Milestone 5 – Dashboard

### Sprint 5.1 – Shell & Navigation

**Stories**
- #7.1.1 – Authenticated app shell
- #7.1.2 – Dashboard landing route

---

### Sprint 5.2 – Dashboard Widgets

**Stories**
- #7.2.1 – Account summary card
- #7.2.2 – Positions preview
- #7.3.1 – Active strategies list
- #7.3.2 – Strategy quick actions
- #7.4.1 – Recent backtests widget
- #7.4.2 – Recent trades widget
- #7.5.1 – Independent widget loading
- #7.5.2 – Empty states
- #7.6.1 – UI consistency
- #7.6.2 – Performance basics

**Exit**
- Dashboard surfaces all core system data

---

## Milestone 6 – AI Assistant / Kernel

### Sprint 6.1 – AI Infrastructure

**Stories**
- #6.1.1 – AI service abstraction
- #6.1.2 – AI usage limits & guardrails
- #6.5.2 – Prompt & response logging
- #6.5.1 – AI disclaimers

---

### Sprint 6.2 – Strategy Intelligence

**Stories**
- #6.2.1 – Explain strategy
- #6.2.2 – Detect logical red flags

---

### Sprint 6.3 – Backtest Intelligence

**Stories**
- #6.3.1 – Explain backtest
- #6.3.2 – Identify failure modes
- #6.4.1 – Suggest improvements

**Exit**
- AI adds insight without touching execution

---

## Milestone 7 – Polish & Resilience

### Sprint 7.1 – Polish & Caching

**Stories**
- #2.5.1 – In-memory cache
- #2.5.2 – Provider fallback guardrails
- UX and performance refinements

**Exit**
- System runs efficiently with caching and provider fallbacks

---

### Sprint 7.2 – Deployment & Hosting

**Stories**
- #8.7.1 – Deployment pipeline (CI build and deploy to target environment)
- #8.7.2 – Hosting environment (API, DB, and scheduled jobs in single region)

**Exit**
- Application deployable to a single-region hosting environment
- CI builds and deploys the API (and optionally frontend) to the chosen target

---

## Final Notes

- This mapping is intentionally explicit
- Each sprint can be converted directly into tickets
- If a sprint slips, later sprints do not collapse
- Cutting scope is easiest in Milestones 6–7

---

**File:** docs/planning/ROADMAP.md
