---
name: sprint-delivery
description: >-
  Delivers the next BitStockerz roadmap sprint end-to-end: branch from the
  previous sprint branch, plan, implement, test to coverage gates, sync docs,
  add manual testing guide, and open a stacked PR. Use when the user asks to
  start, implement, or ship the next sprint, knock out a sprint, or run sprint
  delivery.
disable-model-invocation: true
---

# BitStockerz Sprint Delivery

End-to-end workflow for shipping one roadmap sprint. Read [reference.md](reference.md) for doc checklists, branch naming, and verification commands.

## Before you start

1. Read [docs/product/ROADMAP.md](../../docs/product/ROADMAP.md) and identify the **target sprint** (section marked `START HERE`, or first sprint without `Status: Completed`).
2. Read the matching story file(s) under `docs/product/stories/` for story IDs and acceptance criteria.
3. Read [docs/database/API_Inventory.md](../../docs/database/API_Inventory.md) for API contracts and module boundaries.
4. Confirm with the user which sprint to ship if ROADMAP is ambiguous or multiple sprints are in flight.

Do **not** expand scope beyond the target sprint's stories and exit criteria.

---

## Phase 0 — Branch from previous sprint

Stacked delivery: the new sprint branches from the branch that contains the **immediately prior sprint's code**, not `main`, unless that prior branch is already merged.

### Resolve branches

| Role | How to find it |
|------|----------------|
| **Base branch** (checkout parent) | Prior sprint feature branch, e.g. `feat/sprint-1-2-market-data-candles`. See [reference.md § Branch map](reference.md#branch-map). |
| **New branch** | `feat/sprint-{id}-{short-slug}` (lowercase, hyphens). Example: `feat/sprint-1-3-data-ingestion-jobs`. |
| **PR base** | Same as base branch (stacked PR). If prior sprint is merged to `main`, use `main` for both checkout and PR base. |

### Git commands

```bash
git fetch origin
# If prior sprint branch exists and is not merged:
git checkout <prior-sprint-branch>
git pull origin <prior-sprint-branch>
git checkout -b <new-sprint-branch>

# If prior sprint is merged to main:
git checkout main && git pull origin main
git checkout -b <new-sprint-branch>
```

Never force-push. Never amend pushed commits unless hooks auto-modified files after a successful local commit.

---

## Phase 1 — Senior-level plan

Produce a **concise, expert plan** before writing code. No fluff.

The plan must include:

1. **Sprint scope** — story IDs, exit criteria, explicit out-of-scope items from later sprints
2. **Prerequisites** — what prior sprints already shipped; schema/migration needs
3. **API contract** — routes, query/body shapes, auth (public vs guarded), error cases
4. **Architecture** — modules, services, DTOs, DB tables; reuse existing patterns in `apps/api/src/`
5. **Test strategy** — unit targets, e2e scenarios, seed/fixture data if ingestion is not yet available
6. **Doc touch list** — files from [reference.md § Documentation](reference.md#documentation-sync)
7. **Risks** — empty DB, lint/coverage pitfalls, dependencies on unmerged branches

Use existing conventions:

- NestJS modules under `apps/api/src/`
- RFC 7807 errors via `DomainError` + `ErrorCode`
- `class-validator` DTOs + global `ValidationPipe`
- In-memory seed fallback when `DATABASE_URL` unset / `nodeEnv === 'test'`
- Conventional Commits: `type: subject` (lower-case subject, max 72 chars)
- Angular is the frontend target; backend-only sprints do not scaffold UI unless the sprint explicitly requires it

**Pause for user approval** if they invoked planning only. If they said "knock out" or "ship" the sprint, proceed through all phases without waiting.

---

## Phase 2 — Implement

1. **Schema/migrations** — only if the sprint requires new tables. Follow [docs/database/Migrations_Plan.md](../../docs/database/Migrations_Plan.md). Update `apps/api/prisma/schema.prisma` and run `npm --prefix apps/api run db:migrate` when applicable.
2. **Code** — minimal diff; match surrounding module style. Extend existing modules before creating parallel ones.
3. **Seed/fixtures** — when read APIs or jobs need data before ingestion exists, add deterministic seeds (see `seed-symbols.ts`, `seed-candles.ts` patterns).
4. **Config** — new env vars go through `AppConfigService` / `loadAppConfig`, not raw `process.env` in services.

---

## Phase 3 — Tests and coverage gates

All must pass before docs or PR:

```bash
npm --prefix apps/api run build
npm --prefix apps/api run lint
npm --prefix apps/api run test
npm --prefix apps/api run test:cov
npm --prefix apps/api run test:e2e
```

**Coverage:** global thresholds in `apps/api/package.json` — **90%** branches, functions, lines, statements.

| Layer | Location | Expectations |
|-------|----------|--------------|
| Unit | `src/**/*.spec.ts` | Service logic, DTO validation, controllers, edge cases |
| E2E | `apps/api/test/app.e2e-spec.ts` | Happy paths + RFC 7807 error shapes for new endpoints |

If coverage fails:

- Add tests for new code first
- Fix production type issues before broad eslint suppressions
- Spec-file overrides live in `eslint.config.mjs` only for `*.spec.ts` and `test/**/*.ts`

---

## Phase 4 — Documentation sync

Update every file in [reference.md § Documentation](reference.md#documentation-sync) that applies to the sprint.

Minimum updates:

- **ROADMAP.md** — mark sprint `Status: Completed (verified <date>)`; move `START HERE` to the next sprint
- **Story file(s)** — move story IDs to completed; add acceptance criteria if missing
- **API_Inventory.md** — status table + endpoint sections for new APIs
- **manual_testing.md** — new section with curl examples, expected responses, regression checklist table
- **CHANGELOG.md** + **README.md** — scope and links

Match existing doc tone. Do not create unrelated markdown files.

---

## Phase 5 — Manual testing guide

Append to [docs/manual-testing/manual_testing.md](../../docs/manual-testing/manual_testing.md):

1. **Section header** — `## Section N – <feature> (Sprint X.Y)`
2. **Prerequisites** — port 4000, `/api` prefix, seed vs DB behavior
3. **Success curls** — copy-pasteable, with `jq`
4. **Error curls** — validation, not-found, empty results
5. **Regression checklist table** — scenario | command | expect

Document which symbols/fixtures have seed data when `DATABASE_URL` is unset.

---

## Phase 6 — Commit and stacked PR

Only commit when the user asked to ship/open a PR (this skill implies yes).

```bash
git add -A
git status
git commit -m "$(cat <<'EOF'
feat: <imperative subject for sprint scope>

EOF
)"
git push -u origin <new-sprint-branch>
```

Create PR with `gh`:

```bash
gh pr create \
  --base <prior-sprint-branch-or-main> \
  --title "feat: <subject> (Sprint X.Y)" \
  --body "$(cat <<'EOF'
## Summary
- <1-3 bullets of what shipped>

## Test plan
- [x] build / lint / test / test:cov / test:e2e
- [ ] Manual Section N curls from docs/manual-testing/manual_testing.md

EOF
)"
```

Return the **PR URL** and **branch name** to the user.

---

## Definition of done

- [ ] Branched from correct prior-sprint branch
- [ ] All sprint stories and exit criteria implemented
- [ ] build, lint, test, test:cov (90%+), test:e2e pass
- [ ] Documentation synced per reference checklist
- [ ] Manual testing section added
- [ ] Stacked PR opened against prior-sprint branch (or `main` if merged)
- [ ] User told what to smoke-test manually and what to expect

## Additional resources

- [reference.md](reference.md) — branch map, doc checklist, story file index, patterns
