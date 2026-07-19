# Sprint Delivery Reference

## Branch map

Update this table when a sprint ships. Pattern: `feat/sprint-{milestone}-{sprint}-{slug}`.

| Sprint | Branch | PR base for next sprint |
|--------|--------|-------------------------|
| 1.1 | `feat/sprint-1-1-symbols-and-schemas` | this branch (until merged) |
| 1.2 | `feat/sprint-1-2-market-data-candles` | this branch (until merged) |
| 1.3 | `feat/sprint-1-3-data-ingestion-jobs` | `main` (merged) |
| 1.4 | TBD | `main` |

**Stacked PR rule:** Sprint N+1 PR targets the branch for Sprint N. After Sprint N merges to `main`, Sprint N+1 rebases or merges `main`, then targets `main`.

**Discover prior branch:**

```bash
git branch -r | grep 'feat/sprint-'
gh pr list --state merged --limit 10
```

---

## Dev input checklist

Use during Phase 1 planning and re-check in Phase 2 when touching integrations. Not every row applies every sprint — include only relevant items in the plan's **Dev input required** table.

| Signal in story/docs | Likely dev action | Agent default if stubbing |
|----------------------|-------------------|---------------------------|
| Real market data vendor (Polygon, Alpha Vantage, CoinGecko paid, etc.) | API key + plan choice | Seed/in-memory bars (`seed-candles.ts` pattern) |
| Custom domain / CORS / OAuth redirect URLs | Buy/configure domain; register redirect URIs | `localhost` only; document production URLs needed |
| Email / SMS / push notifications | Provider account + API key | Log-only or no-op sender; document env vars |
| Payments / subscriptions | Stripe/etc. account, webhooks, test keys | Out of scope unless story requires; pause |
| Hosted database / Redis / blob storage | Provision Neon, Upstash, Vercel Blob; paste `DATABASE_URL` | In-memory / Prisma disabled mode |
| JWT / session secrets for deployed env | Generate and set in hosting dashboard | Local dev defaults only; list vars for deploy |
| Scheduled jobs in production | Enable cron on host; confirm `INGESTION_SCHEDULER_ENABLED` | Document flag; default off in production |
| Third-party OAuth (Google, GitHub login) | Create OAuth app; client ID/secret | Defer social login or pause |
| Rate limits / API quotas | Vendor dashboard + billing | Conservative local limits; mock responses |
| Legal copy / disclaimers ("not financial advice") | Product owner wording | Placeholder text; flag for review |
| Angular UI design | Figma or screenshot reference | Backend-only sprint: no UI unless story requires |
| Prior sprint branch not merged | Merge/rebase decision | Stack on prior branch per [branch map](#branch-map) |
| Coverage exclusion for new files | Dev agrees thin wiring stays untested | Add tests first; exclude only after failing 90% gate |

**Pause template** (use in chat when blocked):

```markdown
### ⏸ Dev input needed — <short title>

**Blocks:** <what you cannot implement>
**Story / criterion:** <ID or quote>
**Options:** A) … B) … C) stub with …
**What I need from you:** <one concrete ask>
```

---

## Sprint retrospectives (dev-input examples)

Real sprints where gates should have been surfaced explicitly. Use as calibration for future plans — not as blame, but so the **Dev input required** table is never skipped.

### Sprint 1.2 — Market Data Read APIs (July 2026)

**Stories:** #2.2.3, #2.3.3 | **PR:** [#5](https://github.com/JustinPaoletta/BitStockerz/pull/5) → `main`

| # | Gate | Ideal status | What happened |
|---|------|--------------|---------------|
| 1 | Seed fixtures until 1.3 ingestion | ⏭ stubbed | Correctly noted in plan risks; no pause needed |
| 2 | Candle API acceptance criteria (`limit` 5000, public routes) | ⏸ confirm AC | AC written during sprint; dev approved implicitly via "ship" |
| 3 | Seed symbol list (`AAPL`/`MSFT`/`SPY`, `BTC-USD`/`ETH-USD`) | ⏭ inherited | Reused `seed-symbols.ts`; fine unless wider fixtures wanted |
| 4 | `DATABASE_URL` for DB-mode smoke test | Info only | With DB on, candles return `[]` until 1.3 — should warn in manual test notes |
| 5 | Live market data vendor | N/A | Correctly deferred (Sprint 7.1) |

**Lesson:** Low blocker count, but still worth a one-row **Dev input required** table so seed-vs-DB testing is explicit before merge.

### Sprint 1.3 — Data Ingestion & Jobs (July 2026)

**Stories:** #2.2.2, #2.3.2, #8.1.1–#8.1.3, #8.6.1 | **PR:** [#6](https://github.com/JustinPaoletta/BitStockerz/pull/6) → stacked on 1.2 branch

| # | Gate | Ideal status | What happened |
|---|------|--------------|---------------|
| 1 | **Real provider vs seed import** | ⏭ stub with dev OK | Six stories had **no AC**; agent shipped seed-only ingestion without confirming. API inventory §9 says "don't pick provider yet" — aligned with roadmap, but dev never got an explicit choice |
| 2 | **Missing acceptance criteria** (all 6 stories) | ⏸ draft AC for approval | AC invented during/after implementation |
| 3 | **Ingestion auth** (any user vs admin-only) | ⏭ or ⏸ | Any authenticated user can trigger import — reasonable default, undocumented choice |
| 4 | **Scheduler cadence** (hourly cron) | ⏭ note in plan | `0 * * * *` chosen without asking |
| 5 | **System user** (`system@bitstockerz.local` + fixed UUID) | ⏭ note in plan | Migration seeds synthetic user for scheduled jobs |
| 6 | **Coverage exclusions** (6 new files in `coveragePathIgnorePatterns`) | ⏸ dev approves | Gate passed only after excluding thin wiring files |
| 7 | **`DATABASE_URL` for persisted ingestion test** | Info for dev | In-memory path works; upsert verification needs local MySQL |

**Lesson:** Empty story AC + "import" wording in titles = mandatory pause. Minimum ask: *"Sprint 1.3 is seed pipeline only; live provider deferred to Sprint 7.1 — OK?"*

### Template row for seed-only ingestion sprints

```markdown
| 1 | Market data provider | Stories say "import"; no vendor in scope | ⏭ Seed upsert via `seed-candles.ts`; document in API inventory + ROADMAP deferral to Sprint 7.1 | ⏭ stubbed |
```

---

## Story file index

| Domain | File |
|--------|------|
| User & account | `docs/product/stories/BitStockerz_MVP_01_User_Account_Stories.md` |
| Market data | `docs/product/stories/BitStockerz_MVP_02_Market_Data_Stories.md` |
| Paper trading | `docs/product/stories/BitStockerz_MVP_03_Paper_Trading_Stories.md` |
| Strategy lab | `docs/product/stories/BitStockerz_MVP_04_Strategy_Lab_Stories.md` |
| Backtesting | `docs/product/stories/BitStockerz_MVP_05_Backtesting_Stories.md` |
| Kernel / AI | `docs/product/stories/BitStockerz_MVP_06_Kernel_AI_Assistant_Stories.md` |
| Dashboard UI | `docs/product/stories/BitStockerz_MVP_07_Dashboard_UI_Stories.md` |
| Backend infra | `docs/product/stories/BitStockerz_MVP_08_Backend_Infrastructure_Stories.md` |

---

## Documentation sync

Update each row when the sprint touches that area.

| File | When to update |
|------|----------------|
| `docs/product/ROADMAP.md` | Every sprint — status, `START HERE`, exit |
| `docs/product/stories/BitStockerz_MVP_*.md` | Stories in sprint scope |
| `docs/database/API_Inventory.md` | New or changed HTTP APIs |
| `docs/manual-testing/manual_testing.md` | New user-testable behavior |
| `docs/database/Local_MySQL.md` | Docker MySQL setup or env/migration changes |
| `docs/database/Migrations_Plan.md` | New Prisma migrations |
| `CHANGELOG.md` | Every sprint |
| `README.md` | Scope, e2e coverage, doc links |
| `scripts/sprint-delivery-verify.sh` | Verification gate changes |
| `scripts/smoke-test-api.sh` | Smoke scenario changes |
| `apps/api/prisma/schema.prisma` | Schema changes — header comment |
| `docs/database/schema.prisma` | Runnable subset note if applicable |

**Search for stale scope markers:**

```bash
rg "ships through Sprint|START HERE|Planned for Sprint" docs/
```

---

## Verification commands

Run from repo root:

```bash
npm --prefix apps/api run build
npm --prefix apps/api run lint
npm --prefix apps/api run test          # unit; 90% coverage threshold
npm --prefix apps/api run test:cov
npm --prefix apps/api run test:e2e      # seed mode (setup-e2e.ts)

# Full gate + smoke (API started automatically for smoke phase)
./scripts/sprint-delivery-verify.sh verify

# Same, plus MySQL persistence smoke (loads DATABASE_URL from apps/api/.env)
KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify
```

API defaults: port **4000**, global prefix **`/api`**.

**E2E vs smoke:** e2e always uses in-memory seed mode so it never depends on Docker MySQL. `./scripts/sprint-delivery-verify.sh verify` clears `DATABASE_URL` for the smoke API by default (even when `apps/api/.env` defines it). Set `KEEP_DATABASE_URL=1` to run smoke with MySQL; `./scripts/smoke-test-api.sh` reads `DATABASE_URL` from `apps/api/.env` only for the optional persisted-candles check.

---

## Implementation patterns (apps/api)

| Concern | Pattern |
|---------|---------|
| Errors | `DomainError` + `ErrorCode`; filter in `GlobalHttpExceptionFilter` |
| Validation | DTOs in `dto/`; snake_case query params map to camelCase in service |
| DB optional | `PrismaService.isEnabled`; seed modules for dev/test without `DATABASE_URL` |
| E2E env | `test/setup-e2e.ts` forces `NODE_ENV=test` and clears `DATABASE_URL` |
| Jobs + MySQL | `AuthService.ensureUserPersisted` creates/remaps minimal `users` row before job insert (keeps jobs on email rematch) |
| Public routes | No `AuthGuard` unless story requires auth |
| Module layout | `FeatureModule` → `controller` + `service` + `dto` + `*.spec.ts` |
| E2E setup | `createApp()` in `app.e2e-spec.ts` — global prefix, `ValidationPipe`, exception filter |
| Env loading | `src/load-env.ts` (imported first in `main.ts`); shell scripts use `scripts/lib/load-api-env.sh` |

---

## Manual testing section template

```markdown
## Section N – <Feature name> (Sprint X.Y)

### Prerequisites
<seed vs DB, auth if needed>

### Success – <scenario>
\`\`\`bash
curl -s 'http://localhost:4000/api/...' | jq
\`\`\`
Expected: <status, body shape>

### Validation – <scenario>
\`\`\`bash
curl -s 'http://localhost:4000/api/...' | jq
\`\`\`
Expected: <400/404, code>

## Section N+1 – <Feature> regression checklist

| # | Scenario | Command | Expect |
| --- | --- | --- | --- |
| 1 | ... | ... | ... |
```

---

## Commit and PR conventions

- **Commit:** `feat:`, `fix:`, `docs:`, etc. — lower-case subject, max 72 chars
- **PR title:** `feat: <subject> (Sprint X.Y)`
- **PR body:** `## Summary` (bullets) + `## Test plan` (checkboxes)
- Use `gh pr create --base <prior-sprint-branch>` for stacked PRs
