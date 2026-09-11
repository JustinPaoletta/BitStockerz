# What you still need to do (go-live)

MVP **code and docs are done** in the repo. What’s left is human/ops work: merge
the open PR, create cloud accounts, put secrets in the right places, then run
the first deploy.

Start here. Technical detail is further down.

## Big picture

BitStockerz has three production pieces:

1. **Website** (Angular) → hosted on **Vercel**
2. **API** (NestJS + scheduled jobs) → hosted on **Fly.io**
3. **Database** (MySQL) → a **managed MySQL** service near the API

The repo already has CI, Docker, Fly config, Vercel config, and deploy workflows.
They cannot create your accounts or paste your passwords for you.

## Checklist (do these in order)

### 1. Finish and merge the code PR

- [ ] Open [PR #12](https://github.com/JustinPaoletta/BitStockerz/pull/12)
- [ ] Review it (Milestone 6 AI + Milestone 7 cache/deploy)
- [ ] Merge it into `main` when you’re happy

Until this merges, production deploy from `main` will not include the latest work.

### 2. Create the three cloud pieces (accounts)

You need sign-ups / projects on:

| Piece | Where | What you’re creating |
|-------|--------|----------------------|
| API server | [Fly.io](https://fly.io) | One app that runs the API 24/7 (keep **one** machine while the built-in scheduler is on) |
| Database | Any managed MySQL (PlanetScale-style, AWS RDS, Railway MySQL, etc.) | A MySQL database in the **same region** as the Fly app (default docs use `iad`) |
| Website | [Vercel](https://vercel.com) | A project pointed at this GitHub repo, root/output for `apps/web` |

You will end up with:

- An API URL (example shape: `https://something.fly.dev`)
- A website URL (example shape: `https://something.vercel.app`)
- A database connection string (`DATABASE_URL`)

### 3. Put secrets in GitHub (for automatic deploy)

In GitHub → this repo → **Settings → Environments → `production`**
(create the environment if it doesn’t exist), add:

| Secret name | Plain English meaning |
|-------------|------------------------|
| `DATABASE_URL` | Full MySQL connection string the API uses |
| `FLY_API_TOKEN` | Token so GitHub Actions can deploy to Fly |
| `API_BASE_URL` | Your live API URL (no trailing slash), e.g. `https://api.example.com` |
| `VERCEL_TOKEN` | Token so GitHub Actions can deploy to Vercel |
| `VERCEL_ORG_ID` | Your Vercel org/team id |
| `VERCEL_PROJECT_ID` | Your Vercel project id |

**Never commit these into git.**

### 4. Configure the API host (Fly secrets / env)

On the Fly app, set at least:

| Setting | Plain English |
|---------|----------------|
| `DATABASE_URL` | Same MySQL string as above |
| `CORS_ALLOWED_ORIGINS` | Exact website URL(s), e.g. `https://your-app.vercel.app` (no `*`) |
| `WEBAUTHN_RP_ID` | Domain used for passkeys (often the website hostname) |
| `WEBAUTHN_ALLOWED_ORIGINS` | Exact website origin(s), same idea as CORS |
| `INGESTION_SCHEDULER_ENABLED=true` | Turn on background market-data imports |
| `AI_ENABLED=false` | Keep Kernel AI off in production until you intentionally enable it |
| `JOBS_SYSTEM_USER_ID` | System user id for scheduled jobs (see `apps/api/.env.example`) |

Only add Google/Apple OAuth and `OPENAI_API_KEY` when you decide to turn those on.

### 5. First production deploy

After `main` has the merged PR and secrets exist:

- [ ] Let GitHub Actions **CI** pass on `main`
- [ ] Run / allow the **Deploy** workflow (or deploy manually with Fly + Vercel using the configs in the repo)
- [ ] Confirm API health:
  - `GET {API_BASE_URL}/api/health/live` → ok
  - `GET {API_BASE_URL}/api/health/ready` → ready (needs a working database)
- [ ] Open the Vercel website, sign in, and smoke-test:
  - [ ] Login works
  - [ ] Symbol search works
  - [ ] Paper account / portfolio loads
  - [ ] Refreshing a deep link like `/strategies/...` still works
  - [ ] Browser is talking to the live API (no CORS errors)

### 6. Optional later (not required to “be live”)

These are **not** blocking go-live:

| Item | Meaning |
|------|---------|
| Turn on live Kernel AI | Set `AI_ENABLED=true`, use OpenAI provider + key, after you’re ok with cost/disclaimer |
| Wire a paid market-data vendor | Interface exists; seed/DB path works today |
| Google / Apple login polish | APIs exist; register real production redirect URLs when you enable them |
| `#6.4.2` AI “diff” suggestions | Explicitly deferred product feature |

---

# Technical deployment runbook (MVP Option A)

**Decision:** Always-on Nest API + in-process scheduler on **Fly.io** (single
region), **Vercel** for the static Angular site, managed **MySQL** next to the
API. Option B (Nest on Vercel + Cron) is only documented in
`docs/plans/sprint-7-2-deployment-hosting.md` and is not the default.

## Topology

| Tier | Platform | Notes |
|------|----------|-------|
| Web | Vercel | Build output under `apps/web/dist/web/browser`; SPA rewrite in `apps/web/vercel.json` |
| API + jobs | Fly.io | `apps/api/Dockerfile` + `apps/api/fly.toml`; **one replica** while in-process cron is enabled |
| DB | Managed MySQL | Same region as API (`iad` default); must work with Prisma migrate |

## Required secrets (reference)

Store in GitHub Environment `production` and/or host dashboards. **Never commit.**

| Secret | Used by |
|--------|---------|
| `DATABASE_URL` | migrate + API |
| `FLY_API_TOKEN` | API deploy |
| `API_BASE_URL` | post-deploy smoke + web `apiBaseUrl` injection |
| `VERCEL_TOKEN` | web deploy |
| `VERCEL_ORG_ID` | web deploy |
| `VERCEL_PROJECT_ID` | web deploy |

## Automated release sequence

1. CI green on `main` (build/lint/unit/coverage/e2e + web build).
2. Serialized production concurrency group.
3. `prisma migrate status` → `prisma migrate deploy` **once**.
4. Deploy API; wait for `/api/health/live` and `/api/health/ready`.
5. Build web with `environment.prod.ts` `apiBaseUrl` set to the verified API.
6. Deploy web to Vercel production.

Workflows live in:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

## Smoke checklist (after deploy)

- [ ] `GET /api/health/live` → ok
- [ ] `GET /api/health/ready` → ready with DB up (503 if DB missing in production)
- [ ] Auth session (passkey or email fallback)
- [ ] Symbols search
- [ ] Paper account portfolio read
- [ ] SPA deep-link refresh (`/strategies/...`)
- [ ] CORS preflight from the Vercel origin
- [ ] AI remains disabled (`AI_ENABLED=false`) until approved
- [ ] Exactly one scheduled import job/audit event (single API replica)

## Rollback

1. Fly: `fly releases` / redeploy a previous image or git SHA.
2. Vercel: promote the previous production deployment.
3. DB: restore from provider backup before re-running a destructive migration.
   Prefer expand/contract migrations so the prior API revision stays safe.

## Ops knobs

| Action | How |
|--------|-----|
| Disable scheduler | Set `INGESTION_SCHEDULER_ENABLED=false` and restart API |
| Rotate secrets | Update Fly/Vercel/GitHub secrets; redeploy API |
| Incident health | `/api/health/*`, `/api/market-data/health`, `/api/metrics` |

## Related docs

- Product roadmap status: [docs/product/ROADMAP.md](../product/ROADMAP.md)
- Manual smoke (AI + cache): [docs/manual-testing/manual_testing.md](../manual-testing/manual_testing.md) (Sections 14–15)
- API env template: [apps/api/.env.example](../../apps/api/.env.example)
