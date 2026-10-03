# What you still need to do (go-live)

MVP features, including P&L, chart markers, browser OAuth, profile/recovery and
security fixes, are merged in [PR #13](https://github.com/JustinPaoletta/BitStockerz/pull/13).
The remaining launch work is to provision hosting, configure secrets/provider
callbacks, populate real market data and run the first deployment and production
smoke checks.

**Current state — October 2, 2026:** no production hosting has been provisioned.
GitHub repository and `production` environment secrets are empty. The merged
code passed [main CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089882994).
The [automatic Deploy run](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089883149)
passed its CI gates, then failed at the database migration step with no configured
database; the website deployment was skipped. No production release was published.

Start here. Technical detail is further down.

## Big picture

BitStockerz has three production pieces:

1. **Website** (Angular) → hosted on **Vercel**
2. **API** (NestJS + scheduled jobs) → hosted on **Fly.io**
3. **Database** (MySQL) → a **managed MySQL** service near the API

The repo already has CI, Docker, Fly config, Vercel config, and deploy workflows.
These files are deployment instructions; they do not provision cloud accounts,
an API app, a website project or a database. `deploy.yml` starts automatically
after every push/merge to `main` and can also be started manually. Until hosting
and credentials exist, its deployment jobs cannot complete. CI success and a
merged PR do not mean the product is live.

## Checklist (do these in order)

### 1. Confirm the merged implementation

[PR #12](https://github.com/JustinPaoletta/BitStockerz/pull/12) merged on October 2, 2026 and contains Milestones 6–7 and their security fixes.

- [x] [PR #13](https://github.com/JustinPaoletta/BitStockerz/pull/13) merged on
  October 2, 2026 with P&L, chart markers, browser login, profile/recovery and
  additional security fixes.
- [x] PR and post-merge main CI passed, including dependency audits, secret
  scanning, browser tests and MySQL persistence/security checks.

The features reach production only after hosting is provisioned and deployment succeeds.

### 2. Create the three cloud pieces (accounts)

You need sign-ups / projects on:

| Piece | Where | What you’re creating |
|-------|--------|----------------------|
| API server | [Fly.io](https://fly.io) | One app that runs the API 24/7 (keep **one** machine while the built-in scheduler is on) |
| Database | Managed MySQL-compatible service | A database in the **same region** as the Fly app (default docs use `iad`), with foreign keys, serializable transactions and Prisma migration support |
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
| `TRUSTED_PROXY_CIDRS` | Actual ingress proxy IPs/CIDRs, determined from the deployed network; empty ignores forwarded IP headers. Never trust all addresses. |
| `CORS_ALLOWED_ORIGINS` | Exact website URL(s), e.g. `https://your-app.vercel.app` (no `*`) |
| `WEBAUTHN_RP_ID` | Domain used for passkeys (often the website hostname) |
| `WEBAUTHN_ALLOWED_ORIGINS` | Exact website origin(s), same idea as CORS |
| `AUTH_DEV_EMAIL_ENABLED=false` | Disable dev email register/login in production |
| `AUTH_LEGACY_WEBAUTHN_ENABLED=false` | Disable legacy WebAuthn bypass in production |
| `ERROR_TEST_ENABLED=false` | Keep forced-error test routes off in production |
| `OPENAPI_ENABLED=false` | Keep Swagger/OpenAPI off in production unless you explicitly want it |
| `INGESTION_SCHEDULER_ENABLED=false` initially | Override the `true` template value in `fly.toml` until a real vendor adapter is connected; then enable background imports |
| `AI_ENABLED=false` | Keep Kernel AI off in production until you intentionally enable it |
| `JOBS_SYSTEM_USER_ID` | System user id for scheduled jobs (see `apps/api/.env.example`) |

Configure Google/Apple before enabling their login and recovery buttons, using
the provider checklist below. Add `OPENAI_API_KEY` when enabling live Kernel AI.
Auth users, sessions, and passkeys persist in MySQL after migrations are applied;
restart the API once after the first deploy so auth state hydrates from the database.

Before opening the product to users, populate licensed historical symbol/bar data
and verify a chart, backtest and paper trade against it. The repository does not
include a production data-import tool: prepare an operator-controlled import or
implement the real vendor adapter. Development fixture endpoints are blocked in
production, and the live adapter is currently a stub. Simply enabling the scheduler
does not supply real prices.

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
  - [ ] Charts, backtests and paper trades use the imported real market data
  - [ ] Paper account / portfolio loads
  - [ ] Refreshing a deep link like `/strategies/...` still works
  - [ ] Browser is talking to the live API (no CORS errors)

### 6. Optional later (not required to “be live”)

These are **not** blocking go-live:

| Item | Meaning |
|------|---------|
| Turn on live Kernel AI | Set `AI_ENABLED=true`, use OpenAI provider + key, after you’re ok with cost/disclaimer |
| Implement automated vendor ingestion | Optional for a historical-data launch after the required operator import above. Automated current-market workflows require a real vendor adapter. Production never synthesizes prices. |
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
3. `prisma migrate deploy` **once**, then `prisma migrate status` to verify.
4. Deploy API; wait for `/api/health/live` and `/api/health/ready`.
5. Build web with `environment.prod.ts` `apiBaseUrl` set to the verified API.
6. Deploy web to Vercel production.

Workflows live in:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

## Smoke checklist (after deploy)

- [ ] `GET /api/health/live` → ok
- [ ] `GET /api/health/ready` → ready with DB up (503 if DB missing in production)
- [ ] Auth session (passkey; email fallback only in non-production builds)
- [ ] Symbols search
- [ ] Paper account portfolio read
- [ ] SPA deep-link refresh (`/strategies/...`)
- [ ] CORS preflight from the Vercel origin
- [ ] AI remains disabled (`AI_ENABLED=false`) until approved
- [ ] After a real vendor adapter is connected and scheduling enabled, exactly one scheduled import job/audit event runs per interval (single API replica)
- [ ] Configure only the actual trusted ingress CIDRs; verify two client IPs have separate auth rate-limit buckets and spoofed earlier forwarded hops cannot select an arbitrary IP. Do not guess a broad Fly private-network range.
- [ ] Authenticated POST `/api/jobs` and POST `/api/market-data/ingestion/{equity,crypto}` return 403 in production; only internal scheduling updates shared market data.
- [ ] Database/provider outages return bounded public readiness details without hostnames, credentials or driver errors.
- [ ] Vercel responses include framing, MIME-sniffing and referrer security headers.

## Google/Apple login and recovery setup

The browser implementation cannot prove the live provider setup through mocked
tests. Complete this checklist on the real HTTPS deployments before claiming
Google/Apple recovery is production ready.

1. Set `AUTH_OAUTH_BROWSER_CALLBACK_URL` on the API to the exact SPA callback,
   for example `https://app.example.com/auth/oauth/callback`. This is the fixed
   browser destination; provider return URLs below point to the API instead.
2. Google: create a web OAuth client, configure consent/branding and allowed
   users as needed, and register the exact API return URL
   `https://api.example.com/api/auth/oauth/google/callback`. Set
   `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and
   `GOOGLE_OAUTH_REDIRECT_URI` in API host secrets.
3. Apple: configure Sign in with Apple for the app/Services ID and website
   domain; register `https://api.example.com/api/auth/oauth/apple/callback`.
   Set `APPLE_OAUTH_CLIENT_ID`, `APPLE_OAUTH_TEAM_ID`, `APPLE_OAUTH_KEY_ID`,
   `APPLE_OAUTH_PRIVATE_KEY`, and `APPLE_OAUTH_REDIRECT_URI`. Preserve the signing
   key's newlines using host secret storage. Apple's callback is a form POST.
4. Before migrating an existing database, check for multiple identities for a
   single user's provider (the older auto-linking behavior allowed this):

   ```sql
   SELECT user_id, provider, COUNT(*) AS identity_count
   FROM oauth_identities
   GROUP BY user_id, provider
   HAVING COUNT(*) > 1;
   ```

   The new uniqueness rule allows one identity per provider per user. Resolve
   any returned rows with an explicit account-owner decision before migration;
   the migration does not silently delete recovery identities. Then deploy auth
   migrations before the API. Confirm `/api/auth/providers`
   reports only fully configured providers. The SPA callback must load directly
   and on refresh via its normal rewrite. Keep one API instance while the app
   uses its current in-memory auth cache/scheduler architecture.
5. For each enabled provider, test new signup and returning login. Verify only
   one user/paper account is created; verify email collisions ask for existing
   account sign-in and linking, and never silently attach an identity.
6. With a fresh passkey sign-in, open Profile and link a provider. Sign out, use
   that linked provider as the lost-device recovery method, and verify original
   user id, paper-account id/cash, strategies and backtests. Repeat after API
   restart. Include Apple relay and a second login without its first-login form.
7. Test denial/cancellation, expired callback, refresh/replay and failed links.
   An unsuccessful link must preserve the existing session. Linking after five
   minutes asks for a fresh sign-in; restarting the API must not reset that age.
8. Save a display name, refresh and sign in again; confirm it persists. Check
   desktop/mobile keyboard flow and ensure callback URLs/logs contain no session
   bearer token or provider identity payload.

Recovery requires a provider linked before device loss. There is no email reset
or manual ownership bypass in this release. Additional passkeys remain optional
MVP+ work. Track each enabled provider's live smoke result separately from local
unit, HTTP, browser-mock and MySQL verification.

Provider setup references: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
and [Apple environment configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple).

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

## Prelaunch security review

See [security-review.md](security-review.md) for scope, findings, fixes and verification.
The new identifier migration preserves existing data while giving OAuth subjects,
states, bearer tokens and passkey IDs binary collation. Apply it after the browser
handoff migration; neither migration rewrites previously deployed migration files.
The existing duplicate-provider preflight remains required before the unique index.
Authentication rate limits are process-local: keep one API replica or add a shared
limiter before scaling. Trusted ingress configuration must be checked on the live
network; defaulting to socket IPs is safe against spoofing but can group proxy clients.
