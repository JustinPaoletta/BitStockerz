# BitStockerz MVP – 6) Kernel (AI Assistant) (Stories)

This file retains original story acceptance criteria and dated delivery notes.
[Product extensions](../PRODUCT_EXTENSIONS.md) describe October 4 additions; [the task list](../../../PRODUCT_TASKLIST.md) contains unfinished acceptance checks.

This document defines the epics and user stories for the **Kernel (AI Assistant)** feature of the BitStockerz MVP.

Scope:

- Explain strategies and backtest results in plain English
- Flag obvious logical and statistical issues
- Suggest parameter and rule improvements
- Enforce strict guardrails (AI never trades, edits, or auto-runs)

This module is **advisory only** and requires explicit user action.

Dependencies:

- #4 Strategy Lab
- #5 Backtesting

## Status

- Implemented August 7, 2026; merged in PR #12 on October 2, 2026, with quota/security regressions in PR #13.
- Stub provider covers automated tests; live OpenAI requires `OPENAI_API_KEY`.
- `#6.4.2` parameter previews implemented locally October 4; `AI_DIFF_SUGGESTIONS_ENABLED` defaults false. Live rollout remains pending.

---

## Epic 6.1 – AI Assistant Foundation

### Story 6.1.1 – AI service abstraction

**Acceptance criteria**

- `AiModule` exports `AiService` with stub + OpenAI providers selected by `AI_PROVIDER`.
- Structured generation uses AI SDK `generateText` + `Output.object`.
- AI never writes strategies, orders, positions, or jobs.

### Story 6.1.2 – AI usage limits & guardrails

**Acceptance criteria**

- Daily per-user quota via `ai_usage` (Prisma) or in-memory map (seed mode).
- `AI_ENABLED=false` → `503 AI_DISABLED`; over quota → `429 AI_RATE_LIMIT`.

---

## Epic 6.2 – Strategy Explanation & Validation

### Story 6.2.1 – Explain strategy in plain English

**Acceptance criteria**

- `POST /api/ai/explain-strategy` with `{ strategy_id }` returns disclaimer envelope + `explanation`.
- Ownership miss → `404 STRATEGY_NOT_FOUND`.

### Story 6.2.2 – Detect logical red flags in strategy

**Acceptance criteria**

- `POST /api/ai/validate-strategy` merges deterministic checks with AI warnings.
- Deterministic codes include `DUPLICATE_CONDITION`, `ENTRY_EXIT_CONFLICT`, `UNREFERENCED_INDICATOR`, `UNSATISFIABLE_RANGE`, `RISK_REWARD_NOT_POSITIVE`.

---

## Epic 6.3 – Backtest Result Interpretation

### Story 6.3.1 – Explain backtest performance

**Acceptance criteria**

- `POST /api/ai/explain-backtest` requires completed owned run; otherwise `409 BACKTEST_INVALID_STATE`.

### Story 6.3.2 – Identify failure modes

**Acceptance criteria**

- `explain-backtest` returns merged `issues[]` with heuristics `SHORT_SAMPLE`, `TOO_FEW_TRADES`, `HIGH_DRAWDOWN`, `NEGATIVE_RETURN`, `CONCENTRATED_PNL`.

---

## Epic 6.4 – Strategy Improvement Suggestions

### Story 6.4.1 – Suggest strategy improvements

**Acceptance criteria**

- `POST /api/ai/suggest-improvements` returns advisory `suggestions[]` only (no Apply / no mutation).

### Story 6.4.2 – Diff-style explanation (optional MVP+)

**Status:** Implemented locally October 4, 2026; live rollout remains pending.

**Acceptance criteria**

- The disabled-by-default flag adds `diff: { summary, changes: [{ path, from, to, rationale }] }`.
- At most five previews can change indicator periods or stop/target percentages.
- Original values must match the selected strategy definition; the candidate definition must validate.
- The UI displays changes and rationale without applying them or creating orders.

See [product extensions](../PRODUCT_EXTENSIONS.md#kernel-and-operations).

---

## Epic 6.5 – Transparency, Trust & Safety

### Story 6.5.1 – AI disclaimer & confidence labeling

**Acceptance criteria**

- Every success response includes fixed disclaimer + server-computed `confidence` (`LOW|MEDIUM|HIGH`) + `ai_request_id`.

### Story 6.5.2 – Prompt & response logging (internal)

**Acceptance criteria**

- Production logs/audit are metadata-only; no full prompt/response bodies.

---

## Explicitly Out of Scope (MVP)

- Autonomous strategy execution
- Automatic strategy edits
- Live trading recommendations
- Strategy ranking or leaderboards
- Self-training or reinforcement learning agents
