# Sprint Delivery Reference

## Branch map

Update this table when a sprint ships. Pattern: `feat/sprint-{milestone}-{sprint}-{slug}`.

| Sprint | Branch | PR base for next sprint |
|--------|--------|-------------------------|
| 1.1 | `feat/sprint-1-1-symbols-and-schemas` | this branch (until merged) |
| 1.2 | `feat/sprint-1-2-market-data-candles` | this branch (until merged) |
| 1.3 | `feat/sprint-1-3-data-ingestion-jobs` | TBD at ship time |

**Stacked PR rule:** Sprint N+1 PR targets the branch for Sprint N. After Sprint N merges to `main`, Sprint N+1 rebases or merges `main`, then targets `main`.

**Discover prior branch:**

```bash
git branch -r | grep 'feat/sprint-'
gh pr list --state merged --limit 10
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
| `docs/database/Migrations_Plan.md` | New Prisma migrations |
| `CHANGELOG.md` | Every sprint |
| `README.md` | Scope, e2e coverage, doc links |
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
npm --prefix apps/api run test:e2e
```

API defaults: port **4000**, global prefix **`/api`**.

---

## Implementation patterns (apps/api)

| Concern | Pattern |
|---------|---------|
| Errors | `DomainError` + `ErrorCode`; filter in `GlobalHttpExceptionFilter` |
| Validation | DTOs in `dto/`; snake_case query params map to camelCase in service |
| DB optional | `PrismaService.isEnabled`; seed modules for dev/test without `DATABASE_URL` |
| Public routes | No `AuthGuard` unless story requires auth |
| Module layout | `FeatureModule` → `controller` + `service` + `dto` + `*.spec.ts` |
| E2E setup | `createApp()` in `app.e2e-spec.ts` — global prefix, `ValidationPipe`, exception filter |

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
