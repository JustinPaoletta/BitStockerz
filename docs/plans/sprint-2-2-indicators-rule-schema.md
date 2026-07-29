# Sprint 2.2 — Indicators & Rule Schema

**Status:** Implemented and locally verified; included in draft PR #9
**Roadmap marker:** Implementation complete; Sprints 2.3–3.4 are also complete and `START HERE` is Sprint 4.1

**Branch:** `feat/sprint-2-1-strategy-persistence-versioning` (stacked with Sprint 2.1 at the owner's request)
**PR:** [#9](https://github.com/JustinPaoletta/BitStockerz/pull/9), base `main`

**Overview:** Lock the canonical strategy `definition_json` schema (indicators, AND-only entry/exit conditions, stop-loss / take-profit) and ship a public indicator catalog endpoint. No full CRUD yet — validation helpers are built here so Sprint 2.3 can expose them over HTTP. Pure TypeScript types + validators; no new DB tables.

---

## Sprint scope and exit criteria

**Stories**

| ID | Title | Source |
|----|-------|--------|
| #4.2.1 | Indicator catalog | [MVP_04](../product/stories/BitStockerz_MVP_04_Strategy_Lab_Stories.md), [API_Inventory §4.1](../database/API_Inventory.md) |
| #4.3.1 | Condition schema (atomic rule) | MVP_04 |
| #4.3.2 | Entry rules (AND-only) | MVP_04 |
| #4.3.3 | Exit rules (AND-only) | MVP_04 |
| #4.4.1 | Stop loss configuration | MVP_04 |
| #4.4.2 | Take profit configuration | MVP_04 |

**Exit:** A documented definition schema exists; `GET /strategies/indicators` returns the catalog; `StrategyDefinitionValidator` accepts/rejects definitions used by create/update in 2.3 and by the backtest engine in Milestone 3.

**Explicitly out of scope**

| Item | Why deferred |
|------|----------------|
| CRUD list/update/delete/validate HTTP | Sprint 2.3 |
| Indicator *computation* on bars | Sprint 3.1 (`#5.2.2`) |
| OR / nested groups | MVP_04 out of scope |
| Position sizing, multi-symbol | MVP_04 out of scope |
| AI explain/red-flag | Milestone 6 |
| Angular builder UI | Milestone 5 |

**Migrations:** None ([Migrations_Plan](../database/Migrations_Plan.md) Sprint 2.2).

---

## Prerequisites

| Capability | Relevance |
|------------|-----------|
| Sprint 2.1 `strategies` + `strategy_versions.definition_json` | Storage target for this schema |
| `CreateStrategyDto.definition` opaque object | Tighten validation to schema |
| Market data timeframes `1d`/`1h` | Constraint alignment |
| NestJS DTO + `DomainError` patterns | Catalog + shared validator errors |

---

## Acceptance criteria (implementation contract)

### #4.2.1 – Indicator catalog

- `GET /api/strategies/indicators` returns supported indicators for MVP: **SMA**, **EMA**, **RSI**
- Each entry includes exactly: `key`, `display_name`, `description`, `params[]` (`name`, `type`, `min`, `max`, `default`), `sources`, and `default_source`
- Auth: **public** (no PII; helps Angular builder later) — see JC-1
- Catalog is code-defined (const), not DB-backed
- Unit test asserts keys and required param metadata

### #4.3.1 – Condition schema

- Atomic condition shape documented and typed:

```ts
type Operand =
  | { indicator: string }           // references indicators[].id
  | { price: 'open' | 'high' | 'low' | 'close' }
  | { literal: number };

type Condition = {
  left: Operand;
  op:
    | 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
    | 'crosses_above' | 'crosses_below';
  right: Operand;
};
```

- Validator rejects unknown ops, missing operands, non-finite literals
- `crosses_*` requires at least one dynamic operand (indicator or price). Dynamic-vs-literal is valid; literal-vs-literal is rejected — see JC-2
- `eq` uses a documented relative epsilon (`1e-9 * max(1, abs(left), abs(right))`) rather than exact floating-point equality in the 3.1 engine

### #4.3.2 / #4.3.3 – Entry / exit AND-only

- Definition includes:

```json
{
  "entry": { "logic": "AND", "conditions": [ /* 1..N */ ] },
  "exit":  { "logic": "AND", "conditions": [ /* 1..N */ ] }
}
```

- `logic` must be `"AND"` only; `"OR"` → validation error
- Entry and exit each require **≥ 1** condition (JC-3)
- Max conditions per group: **10** (JC-4)

### #4.4.1 / #4.4.2 – Stop loss / take profit

```json
{
  "risk": {
    "stop_loss": { "type": "percent", "value": 2.0 },
    "take_profit": { "type": "percent", "value": 4.0 }
  }
}
```

- MVP supports `type: "percent"` only (percent of entry price)
- `value` must be `> 0` and `≤ 50` for SL, `≤ 500` for TP (owner override to JC-5)
- Both SL and TP **required** in MVP definitions (JC-6)
- Optional future: `type: "atr"` — not in catalog this sprint

### Cross-cutting definition rules

- Top-level required keys: `indicators`, `entry`, `exit`, `risk`
- `indicators[]`: each `{ id, type, params, source }`; `source` is required in persisted definitions, the catalog tells clients to default it to `close`, `id` is unique within the definition, and `type` is in the catalog
- `indicators` contains at most 20 entries; `id` is 1–64 characters matching `^[A-Za-z][A-Za-z0-9_-]*$`
- SMA/EMA `period` integer 2–200; RSI `period` integer 2–100
- Indicator refs in conditions must exist in `indicators[]`
- Reject unknown keys at every schema level and reject `NaN`/`Infinity`; do not silently strip or persist unrecognized fields
- `StrategyDefinitionValidator.validate(def) → { is_valid, errors: { path, code, message }[] }`
- Error order is deterministic: depth-first in document order. Paths are relative to the definition root; write-endpoint RFC 7807 field errors prefix them with `definition.`
- Wire validator into `StrategiesService.create` so invalid definitions fail at write time (forward-compat with 2.3)

---

## API contract

### `GET /api/strategies/indicators` (#4.2.1)

**Response `200`**

```json
{
  "indicators": [
    {
      "key": "SMA",
      "display_name": "Simple Moving Average",
      "description": "Arithmetic mean of source over period bars.",
      "params": [
        { "name": "period", "type": "integer", "min": 2, "max": 200, "default": 20 }
      ],
      "sources": ["open", "high", "low", "close"],
      "default_source": "close"
    },
    {
      "key": "EMA",
      "display_name": "Exponential Moving Average",
      "description": "Exponentially weighted moving average of source.",
      "params": [
        { "name": "period", "type": "integer", "min": 2, "max": 200, "default": 20 }
      ],
      "sources": ["open", "high", "low", "close"],
      "default_source": "close"
    },
    {
      "key": "RSI",
      "display_name": "Relative Strength Index",
      "description": "Momentum oscillator 0–100.",
      "params": [
        { "name": "period", "type": "integer", "min": 2, "max": 100, "default": 14 }
      ],
      "sources": ["close"],
      "default_source": "close"
    }
  ]
}
```

### Definition schema (canonical document)

Publish the contract in code types/comments, API_Inventory §4, and story acceptance criteria. Do not add another definition README (JC-7).

**Example valid definition**

```json
{
  "indicators": [
    { "id": "sma_fast", "type": "SMA", "params": { "period": 10 }, "source": "close" },
    { "id": "sma_slow", "type": "SMA", "params": { "period": 30 }, "source": "close" },
    { "id": "rsi", "type": "RSI", "params": { "period": 14 }, "source": "close" }
  ],
  "entry": {
    "logic": "AND",
    "conditions": [
      {
        "left": { "indicator": "sma_fast" },
        "op": "crosses_above",
        "right": { "indicator": "sma_slow" }
      },
      {
        "left": { "indicator": "rsi" },
        "op": "lt",
        "right": { "literal": 70 }
      }
    ]
  },
  "exit": {
    "logic": "AND",
    "conditions": [
      {
        "left": { "indicator": "sma_fast" },
        "op": "crosses_below",
        "right": { "indicator": "sma_slow" }
      }
    ]
  },
  "risk": {
    "stop_loss": { "type": "percent", "value": 2 },
    "take_profit": { "type": "percent", "value": 4 }
  }
}
```

### Create path behavior change

`POST /strategies` (from 2.1) begins rejecting invalid definitions with
definition-rooted `fieldErrors` paths like
`definition.entry.conditions[0].op`; Sprint 2.3 upgrades the envelope code to
`400 STRATEGY_VALIDATION_ERROR`.

---

## Architecture

```mermaid
flowchart TB
  IC[IndicatorsController or StrategiesController]
  CAT[IndicatorCatalog]
  VAL[StrategyDefinitionValidator]
  SS[StrategiesService]
  IC --> CAT
  SS --> VAL
  VAL --> CAT
```

**Files**

| Path | Role |
|------|------|
| `strategies/definition/strategy-definition.types.ts` | Canonical TS types |
| `strategies/definition/indicator-catalog.ts` | Const catalog |
| `strategies/definition/strategy-definition.validator.ts` | Pure validate() |
| `strategies/definition/strategy-definition.validator.spec.ts` | Exhaustive unit tests |
| `strategies/indicators.controller.ts` **or** route on strategies controller | `GET indicators` |
| Update `create-strategy.dto.ts` | Keep `definition` as object; service runs validator |

Implement validation as **pure functions** (no Nest DI inside validator) for reuse by backtest engine (3.1) and AI (6.2).

---

## Implementation plan (ordered)

1. Write AC into MVP_04 for #4.2.1–#4.4.2.
2. Add types + catalog + validator with table-driven unit tests (valid, each error code).
3. Expose `GET /strategies/indicators`.
4. Integrate validator into `StrategiesService.create` (and prepare export for 2.3 update/validate).
5. E2E: indicators 200; create with bad definition → 400; create with example → 201.
6. Docs: API_Inventory §4.1 + definition schema notes; manual testing curls; ROADMAP status.

Contract tests must also cover duplicate ids, unknown keys, array/object confusion, dynamic-vs-literal crosses, literal-vs-literal cross rejection, deterministic error ordering, and catalog/validator parameter-bound parity.

---

## Best-practice checklist

- [x] Schema-as-code: single source of truth for types + validator
- [x] Pure validator unit-tested without Nest testing module
- [x] Stable error `code` strings for field errors (`UNKNOWN_INDICATOR`, `OR_NOT_SUPPORTED`, …)
- [x] Catalog params drive future Angular forms ([API_Inventory](../database/API_Inventory.md))
- [x] Do not compute indicators yet — schema only
- [x] Align ops with what engine can evaluate in 3.1 (no “looks good in JSON” ops)
- [x] Conventional Commit: `feat: add strategy indicator catalog and definition schema`

**Indicator math library (decision for later 3.1):** Implement SMA/EMA/RSI as small pure functions matching this schema; do not add `technicalindicators` unless JC-8 is explicitly reversed.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Schema churn after strategies saved | Treat definition as versioned with strategy versions; breaking changes require new version_number on update (2.3) |
| Over-flexible ops engine cannot run | Limit ops enum to engine-ready set above |
| Public catalog vs auth inconsistency | JC-1; document |
| Existing `{}` strategies from 2.1 tests | Migration not needed; tests update fixtures; production empty |

---

## Adopted defaults and override triggers

| # | Blocker | Why | Default | Status |
|---|---------|-----|---------|--------|
| 1 | Public vs auth catalog | Inventory silent | Public | Adopted |
| 2 | Require SL/TP always | Product may want optional | Required percent both | Adopted |
| 3 | Min conditions | Empty entry ambiguous | ≥1 each | Adopted |

---

## Judgement calls

### JC-1 — Catalog auth

**Decision:** Public `GET /strategies/indicators`.  
**Why:** No user data; simplifies Angular later; matches public symbol search pattern.  
**Discuss if:** Want all `/strategies/*` behind auth for consistency.

### JC-2 — `crosses_above` / `crosses_below` semantics

**Decision:** True on the bar where previous left≤right and current left>right (above), inverse for below. At least one operand must be dynamic; a literal is treated as the same constant on current/previous bars. Document for engine; validator checks operand compatibility.
**Why:** Standard crossover definition; evaluation is 3.1.  
**Discuss if:** Product wants “while above” continuous true (that would be `gt`, not cross).

### JC-3 — Empty condition groups

**Decision:** Reject empty `conditions` arrays.  
**Why:** Untradeable strategies should fail validation early.  
**Discuss if:** Allow draft strategies with empty rules (would need `status: draft` — out of scope).

### JC-4 — Max 10 conditions

**Decision:** Cap at 10 per entry/exit group.  
**Why:** Guardrail for MVP complexity and AI prompt size later.  
**Discuss if:** Different cap wanted.

### JC-5 — Percent bounds

**Decision:** SL `(0, 50]`, TP `(0, 500]` (owner override recorded July 27, 2026).
**Why:** Prevent invalid/non-positive configs while supporting the requested wider TP experiments.
**Discuss if:** Tighter product limits.

### JC-6 — SL/TP required

**Decision:** Both required in `risk`.  
**Why:** MVP risk rules stories imply configuration exists; simplifies engine.  
**Discuss if:** Optional SL or TP independently.

### JC-7 — Extra definition README

**Decision:** No new top-level markdown file; document in API_Inventory + story AC + code types.  
**Why:** Avoid doc sprawl per user preference.  
**Discuss if:** Team wants `docs/product/Strategy_Definition.md`.

### JC-8 — Indicator library for 3.1 (record now)

**Decision (advisory for 3.1):** Implement pure SMA/EMA/RSI in-repo; do not add `technicalindicators` in 2.2.  
**Why:** Tiny surface, full test control, no dep drift.  
**Discuss if:** Prefer battle-tested library ([technicalindicators](https://github.com/anandanand84/technicalindicators)).

### JC-9 — Schema version field

**Decision:** Omit `schema_version` on definition for MVP; imply v1 by code.  
**Why:** YAGNI until breaking change.  
**Discuss if:** Want explicit `schema_version: 1` from day one.

---

## Suggested ticket breakdown

| Ticket | Estimate |
|--------|----------|
| Types + catalog + AC docs | 0.5d |
| Validator + exhaustive unit tests | 1.25d |
| GET indicators + wire create validation | 0.5d |
| E2E + API inventory + manual section | 0.5d |

**Total:** ~2.75 eng days.

---

## Definition of done

- [x] Stacked on the Sprint 2.1 branch in the same PR, per owner direction
- [x] Catalog endpoint live; definition validator integrated on create
- [x] AC written for all six stories
- [x] Gates green (build/lint/test/cov/e2e plus seed/MySQL smoke verification)
- [x] Historical completion record: docs were synced and the roadmap marker
  advanced to Sprint 2.3; the current marker is maintained in this plan header.
- [x] Included in draft PR #9

---

## References

- API Inventory §4.1–4.3: `docs/database/API_Inventory.md`  
- NestJS DTOs/pipes: https://docs.nestjs.com/pipes  
- MVP Strategy Lab: `docs/product/stories/BitStockerz_MVP_04_Strategy_Lab_Stories.md`  
- technicalindicators (deferred option): https://github.com/anandanand84/technicalindicators  
- Sprint 2.1 plan: `docs/plans/sprint-2-1-strategy-persistence-versioning.md`
