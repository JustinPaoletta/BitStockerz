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
- Reads and writes are owner-scoped. Missing, inactive, or another user's strategy returns `404 STRATEGY_NOT_FOUND`.

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

**Status:** Completed (verified July 27, 2026)

**Acceptance criteria**

- Public `GET /api/strategies/indicators` returns code-defined SMA, EMA, and RSI entries with exact display, description, parameter, source, and default-source metadata.
- SMA/EMA accept integer period 2–200 and OHLC sources; RSI accepts integer period 2–100 and close only. The catalog and validator share these bounds.

---

## Epic 4.3 – Rule Builder

### Story 4.3.1 – Condition schema (atomic rule)

**Status:** Completed (verified July 27, 2026)

- Conditions contain `left`, `op`, and `right`. Each operand contains exactly one indicator reference, OHLC price source, or finite numeric literal.
- Supported operators are `gt`, `gte`, `lt`, `lte`, `eq`, `crosses_above`, and `crosses_below`. Crossover comparisons require at least one dynamic operand and indicator references must resolve.

### Story 4.3.2 – Entry rule group (AND-only MVP)

**Status:** Completed (verified July 27, 2026)

- Entry uses `logic: "AND"` with 1–10 conditions. OR, nested groups, unknown keys, and malformed shapes are rejected.

### Story 4.3.3 – Exit rule group (AND-only MVP)

**Status:** Completed (verified July 27, 2026)

- Exit uses the same AND-only 1–10-condition contract and validation as entry.

---

## Epic 4.4 – Risk Rules

### Story 4.4.1 – Stop loss configuration

**Status:** Completed (verified July 27, 2026)

- A definition requires `risk.stop_loss` with exactly
  `{ "type": "percent", "value": number }`; value must be greater than 0 and
  at most 50.

### Story 4.4.2 – Take profit configuration

**Status:** Completed (verified July 27, 2026)

- A definition requires `risk.take_profit` with exactly
  `{ "type": "percent", "value": number }`; value must be greater than 0 and
  at most 500.

---

## Epic 4.5 – Strategy CRUD APIs

### Story 4.5.1 – Create strategy

**Status:** Completed locally (verified July 28, 2026; draft PR #9)

- Authenticated create persists valid metadata plus immutable version 1.
- The response includes the canonical definition and deterministic `summary`.
- Duplicate normalized names return `409 CONFLICT`; invalid definitions return
  `400 STRATEGY_VALIDATION_ERROR`.

### Story 4.5.2 – Update strategy (new version)

**Status:** Completed locally (verified July 28, 2026; draft PR #9)

- Partial `PUT /api/strategies/:id` updates mutable metadata; `description:
  null` clears the description and an empty body is invalid.
- A present valid definition always appends the next immutable version,
  including an identical repeat. Metadata-only changes do not add a version.
- Version allocation is serialized in MySQL with one bounded conflict retry.

### Story 4.5.3 – List user strategies

**Status:** Completed locally (verified July 28, 2026; draft PR #9)

- The active owner list uses `limit`/`offset`, returns `has_more`, and sorts by
  `updated_at DESC, id ASC`.
- List items include current version metadata but omit the full definition.

### Story 4.5.4 – Get strategy details

**Status:** Completed locally (verified July 28, 2026; draft PR #9)

- Latest reads include definition, version, and deterministic summary.
- `?version=N` returns an immutable historical definition with
  `version_created_at` and `is_latest`; a missing version returns
  `STRATEGY_VERSION_NOT_FOUND`.

### Story 4.5.5 – Delete strategy (soft delete)

**Status:** Completed locally (verified July 28, 2026; draft PR #9)

- Delete sets `is_active=false`, returns an empty `204`, and hides the row from
  list/get/validation. A repeated delete returns `STRATEGY_NOT_FOUND`.
- The normalized name remains reserved.

---

## Epic 4.6 – Strategy Validation & Preview

### Story 4.6.1 – Strategy validation endpoint

**Status:** Completed locally (verified July 28, 2026; draft PR #9)

- `POST /api/strategies/validate` accepts exactly one inline definition or
  active owned `strategy_id`.
- Valid and invalid definitions return a side-effect-free `200` validation
  envelope; invalid request envelopes use `STRATEGY_VALIDATION_ERROR`.

### Story 4.6.2 – Human-readable strategy summary

**Status:** Completed locally (verified July 28, 2026; draft PR #9)

- A pure, deterministic formatter summarizes entry, exit, stop-loss, and
  take-profit rules without AI.
- Summary is exposed on create, update, details, and successful validation.

---

## Explicitly Out of Scope (MVP)

- OR logic / nested condition groups
- Position sizing rules
- Multi-symbol strategies
- Parameter optimization
- AI assistance (handled in #6)
