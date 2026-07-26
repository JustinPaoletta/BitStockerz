# BitStockerz MVP – 4) Strategy Lab (Stories)

This document defines the epics and user stories for the **Strategy Lab** feature of the BitStockerz MVP.

Scope:
- Rule-based strategy builder
- Technical indicators (SMA, EMA, RSI)
- Entry and exit conditions
- Stop loss and take profit rules
- Strategy persistence and versioning
- Validation and human-readable summaries

This module feeds directly into **#5 Backtesting**.

---

## Epic 4.1 – Strategy Model & Persistence

### Story 4.1.1 – Strategy schema (core metadata)

**Status:** Completed (verified July 25, 2026)

**Acceptance criteria**

- Authenticated users can create `EQUITY` daily or `CRYPTO` daily/hourly strategies; `symbol_scope` is `SINGLE` for MVP.
- Strategy names are trimmed, 1–255 characters, and unique per user under case/accent-insensitive comparison.
- MySQL persists strategy metadata with a user foreign key; seed mode provides equivalent process-local behavior.
- Reads and writes are owner-scoped. Missing, inactive, or another user's strategy returns `404 NOT_FOUND`.

### Story 4.1.2 – Strategy versioning (MVP-light)

**Status:** Completed (verified July 25, 2026)

**Acceptance criteria**

- Creating a strategy atomically creates immutable version 1 with a non-null, non-array JSON definition object.
- `GET /api/strategies/:id` returns metadata plus the latest `version_number` and `definition`.
- Creating a strategy records a bounded `strategy.created` audit event without logging the definition.
- Definition structure remains opaque until Story 4.2.1 and Epic 4.3 validation ship.

---

## Epic 4.2 – Indicator Library

### Story 4.2.1 – Supported indicators catalog

---

## Epic 4.3 – Rule Builder

### Story 4.3.1 – Condition schema (atomic rule)
### Story 4.3.2 – Entry rule group (AND-only MVP)
### Story 4.3.3 – Exit rule group (AND-only MVP)

---

## Epic 4.4 – Risk Rules

### Story 4.4.1 – Stop loss configuration
### Story 4.4.2 – Take profit configuration

---

## Epic 4.5 – Strategy CRUD APIs

### Story 4.5.1 – Create strategy
### Story 4.5.2 – Update strategy (new version)
### Story 4.5.3 – List user strategies
### Story 4.5.4 – Get strategy details
### Story 4.5.5 – Delete strategy (soft delete)

---

## Epic 4.6 – Strategy Validation & Preview

### Story 4.6.1 – Strategy validation endpoint
### Story 4.6.2 – Human-readable strategy summary

---

## Explicitly Out of Scope (MVP)

- OR logic / nested condition groups
- Position sizing rules
- Multi-symbol strategies
- Parameter optimization
- AI assistance (handled in #6)
