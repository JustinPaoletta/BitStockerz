# What you still need to do (go-live)

MVP features, including P&L, chart markers, browser OAuth, profile/recovery and
security fixes, are merged in [PR #13](https://github.com/JustinPaoletta/BitStockerz/pull/13).
The remaining launch work is to provision hosting, configure secrets/provider
callbacks, populate real market data and run the first deployment and production
smoke checks.

**Dated launch inspection — October 2, 2026:** no production hosting has been provisioned.
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

## Launch setup

### 1. Create the three cloud pieces (accounts)

You need sign-ups / projects on:

| Piece      | Host                             | Resource                                                                                                                                             |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| API server | [Fly.io](https://fly.io)         | One app that runs the API 24/7 (keep **one** machine while the built-in scheduler is on)                                                             |
| Database   | Managed MySQL-compatible service | A database in the **same region** as the Fly app (default docs use `iad`), with foreign keys, serializable transactions and Prisma migration support |
| Website    | [Vercel](https://vercel.com)     | A project pointed at this GitHub repo, root/output for `apps/web`                                                                                    |

You will end up with:

- An API URL (example shape: `https://something.fly.dev`)
- A website URL (example shape: `https://something.vercel.app`)
- A database connection string (`DATABASE_URL`)

### 2. Put secrets in GitHub (for automatic deploy)

In GitHub → this repo → **Settings → Environments → `production`**
If the environment does not exist, create it. Add these secrets:

| Secret name         | Plain English meaning                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`      | Full MySQL connection string the API uses                             |
| `FLY_API_TOKEN`     | Token so GitHub Actions can deploy to Fly                             |
| `API_BASE_URL`      | Your live API URL (no trailing slash), e.g. `https://api.example.com` |
| `VERCEL_TOKEN`      | Token so GitHub Actions can deploy to Vercel                          |
| `VERCEL_ORG_ID`     | Your Vercel org/team id                                               |
| `VERCEL_PROJECT_ID` | Your Vercel project id                                                |

**Never commit these into git.**

### 3. Configure the API host (Fly secrets / env)

On the Fly app, set at least:

| Setting                                       | Plain English                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                | Same MySQL string as above                                                                                                           |
| `TRUSTED_PROXY_CIDRS`                         | Actual ingress proxy IPs/CIDRs, determined from the deployed network; empty ignores forwarded IP headers. Never trust all addresses. |
| `CORS_ALLOWED_ORIGINS`                        | Exact website URL(s), e.g. `https://your-app.vercel.app` (no `*`)                                                                    |
| `WEBAUTHN_RP_ID`                              | Domain used for passkeys (often the website hostname)                                                                                |
| `WEBAUTHN_ALLOWED_ORIGINS`                    | Exact website origin(s), same idea as CORS                                                                                           |
| `AUTH_DEV_EMAIL_ENABLED=false`                | Disable dev email register/login in production                                                                                       |
| `AUTH_LEGACY_WEBAUTHN_ENABLED=false`          | Disable legacy WebAuthn bypass in production                                                                                         |
| `ERROR_TEST_ENABLED=false`                    | Keep forced-error test routes off in production                                                                                      |
| `OPENAPI_ENABLED=false`                       | Keep Swagger/OpenAPI off in production unless you explicitly want it                                                                 |
| `INGESTION_SCHEDULER_ENABLED=false` initially | The template is `false`; enable scheduling only after licensed data and live ingestion pass their checks                             |
| `AI_ENABLED=false`                            | Keep Kernel AI off in production until you intentionally enable it                                                                   |
| `JOBS_SYSTEM_USER_ID`                         | System user id for scheduled jobs (see `apps/api/.env.example`)                                                                      |

Configure Google/Apple before enabling their login and recovery buttons, using
the provider checklist below. Add `OPENAI_API_KEY` when enabling live Kernel AI.
Auth users, sessions, and passkeys persist in MySQL after migrations are applied.
After the first deployment, restart the API to test auth hydration.

Before opening the product to users, populate licensed historical symbol/bar data
and verify a chart, backtest and paper trade against it. The repository now includes a licensed-data importer and Alpaca historical adapter.
Configure credentials/entitlement and verify actual data before enabling live
ingestion. Development fixture endpoints remain blocked in production. See
the procedures below for database gates, licensed data, backups, and alerts.

### 4. First production deploy

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

### 5. Optional later (not required to “be live”)

These are **not** blocking go-live:

| Item                              | Meaning                                                                                                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Turn on live Kernel AI            | Set `AI_ENABLED=true`, use OpenAI provider + key, after owner acceptance of costs and final disclaimer                                                                                                                       |
| Enable automated vendor ingestion | Optional for a historical-data launch after the required operator import above. The implemented Alpaca adapter requires credentials and live verification for current-market workflows. Production never synthesizes prices. |
| `#6.4.2` AI change previews       | Implemented locally under a disabled flag; live verification pending                                                                                                                                                         |

---

# Technical deployment runbook (MVP Option A)

The adopted topology uses an always-on NestJS API on Fly.io, a static Angular SPA on Vercel, and nearby managed MySQL.
Stateful services use one region; Vercel distributes static files globally.

An all-Vercel API was considered during planning.
It would require replacing in-process cron with an authenticated HTTP trigger and adapting backtests to function deadlines.
That alternative and its proposed `/api/internal/cron/market-data` route are not implemented.

## Topology

| Tier       | Platform      | Notes                                                                                         |
| ---------- | ------------- | --------------------------------------------------------------------------------------------- |
| Web        | Vercel        | Build output under `apps/web/dist/web/browser`; SPA rewrite in `apps/web/vercel.json`         |
| API + jobs | Fly.io        | `apps/api/Dockerfile` + `apps/api/fly.toml`; **one replica** while in-process cron is enabled |
| DB         | Managed MySQL | Same region as API (`iad` default); must work with Prisma migrate                             |

## Deployment secrets

Use the names in [GitHub secret setup](#2-put-secrets-in-github-for-automatic-deploy).
The workflow uses `DATABASE_URL` for migration, Fly credentials for API deployment, and Vercel credentials for the web project.
`API_BASE_URL` supplies post-deploy smoke tests and the web build's API location.
Store API runtime secrets on the host as well.

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
- [ ] After live ingestion passes, enable scheduling.
      Confirm exactly one scheduled import job/audit event runs per interval on the single API replica.
- [ ] Configure only the actual trusted ingress CIDRs.
      Confirm two client IPs have separate auth rate-limit buckets.
      Confirm spoofed earlier forwarded hops cannot select an arbitrary client IP.
      Do not guess a broad Fly private-network range.
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
2. Google: create a web OAuth client.
   Configure consent/branding and allowed users as needed. Register the exact API return URL
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

5. For each enabled provider, test new signup and returning login. Confirm only one user/paper account is created.
   Confirm email collisions require existing-account sign-in and explicit linking without silently attaching an identity.
6. With a fresh passkey sign-in, open Profile and link a provider. Sign out.
   Use the linked provider for lost-device recovery.
   Confirm the original user, paper-account id/cash, strategies, and backtests. Repeat after API
   restart. Include Apple relay and a second login without its first-login form.
7. Test denial/cancellation, expired callback, refresh/replay and failed links.
   An unsuccessful link must preserve the existing session. Linking after five
   minutes asks for a fresh sign-in; restarting the API must not reset that age.
8. Save a display name. Refresh the page and sign in again. Confirm the name persists.
   Do desktop/mobile keyboard tests.
   Make sure callback URLs/logs contain no bearer token or provider identity payload.

Recovery requires a provider linked before device loss. There is no email reset
or manual ownership bypass in this release. Additional passkeys are locally implemented; deployed-device verification remains outstanding. They are optional
MVP+ work. Track each enabled provider's live smoke result separately from local
unit, HTTP, browser-mock and MySQL verification.

Provider setup references: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
and [Apple environment configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple).

## Rollback

1. Fly: `fly releases` / redeploy a previous image or git SHA.
2. Vercel: promote the previous production deployment.
3. DB: prefer forward fixes. Verify older binaries tolerate the additive schema;
   pause scheduling before rollback and test auth/ledger afterward. Restore only
   through an approved, verified recovery procedure that reapplies deletion requests.
   Prefer expand/contract migrations so the prior API revision stays safe.

## Ops knobs

| Action            | How                                                        |
| ----------------- | ---------------------------------------------------------- |
| Disable scheduler | Set `INGESTION_SCHEDULER_ENABLED=false` and restart API    |
| Rotate secrets    | Update Fly/Vercel/GitHub secrets; redeploy API             |
| Incident health   | `/api/health/*`, `/api/market-data/health`, `/api/metrics` |

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

## Database verification before release

Docker Desktop's local daemon did not respond, so the new migrations and MySQL
regressions have not run locally. Start Docker Desktop or supply a disposable
MySQL 8 database. Never point test harnesses at production or a valued database.
Use Node 24.21.0, apply `npm --prefix apps/api run db:deploy`, then run:

```sh
npm --prefix apps/api run test:mysql:backtest
npm --prefix apps/api run test:mysql:trading
npm --prefix apps/api run test:mysql:security
npm --prefix apps/api run test:mysql:auth
npm --prefix apps/api run test:mysql:workspace
```

Supply `DATABASE_URL` through your environment/secret manager, without placing
it in documentation or shell history. CI now includes the workspace harness,
which checks cost/benchmark persistence, watchlists, runner restart/idempotency,
enrollment-challenge ownership, reset archives, exports, deletion and isolation.
Passing CI on the final revision remains required. Three new migrations add
simulation/benchmark/fee storage, enrollment binding, watchlists, reset archives,
retired order keys and runners. On an existing database, follow the OAuth identity
preflight in [Google/Apple setup](#googleapple-login-and-recovery-setup) before applying migrations.

## Licensed market data

Choose a source and confirm product display/redistribution rights. The Alpaca
adapter is implemented, but this does not establish entitlement. Configure
`ALPACA_API_KEY`, `ALPACA_SECRET_KEY` and `ALPACA_EQUITY_FEED` in host secrets;
`iex` is the default and `sip` requires the appropriate entitlement. Populate
supported symbols/history with the licensed importer or verified vendor jobs.
Validate imports first, then import into the intended database and restart the
API. Confirm timestamp alignment, completed candles, advertised ranges and
health for equity daily plus crypto daily/hourly.

Set `MARKET_DATA_LIVE_ENABLED=true` only after a real provider smoke. Provision
the configured `JOBS_SYSTEM_USER_ID`, enable scheduling and verify one ingestion
job per interval. Test vendor outage behavior, stale prices and runner pause,
then resume only after review. Verify adjusted stock history and choose freshness
thresholds that account for market closures. Never advertise seed data as real
prices. Demonstrate charts → backtest → manual paper fill → runner activity with
real data and record the dates/symbols/results.

## Live Kernel AI

Optional: create an OpenAI project/key and set `OPENAI_API_KEY` in host secrets.
Choose a model, project budget and daily-call limit. Test structured output,
timeouts, quota enforcement, safe logging and all advisory responses, including
parameter previews if enabled. Keep `AI_ENABLED=false` until verified. Configure
host alerts for provider failures, sustained latency and quota/cost thresholds.
Stub tests do not establish live provider behavior or operating cost.

## Backups, alerts, and support

Use the database provider's encrypted automated backups and restrict restore
access. Select retention periods for database backups and host logs.
Publish the selected periods.
An initial proposal is 30 days for backups and 14 days for operational logs.
Provider capability and owner requirements determine the final policy; these are not current promises.

Set recovery-point and recovery-time objectives (RPO/RTO). Assign an operator.

Document the provider's restore steps and identifiers without credentials.
Restore a backup into an isolated database.
Inspect migrations and reconcile fixture users, passkey/provider identities, strategy versions, backtest trades/equity, and paper cash/positions.
Keep restored data offline until validation and reapplication of deletion requests.

Store a restricted deletion-request record outside restored application backups.
Use minimal identifying information and a purge policy.
The app does not implement this operational record. Purge expired backups
and logs according to the published policy.

Set the repository variable `PRODUCTION_API_BASE_URL` to the public API origin
without a trailing slash for the prepared 15-minute health workflow. This read-only
monitor uses a public URL, so it can run without deployment-environment approval. Enable GitHub Actions failure
notifications for a named recipient and run it manually once. Add host-native
alerts for API/database failures, ingestion jobs, stale feeds and optional AI
failures/limits. Record severity, on-call recipient, escalation and recovery
steps. The GitHub check is a baseline, not a substitute for these alerts.

Provide a public support contact or issue channel accessible to customers and
update the Help page. Triage with request ID, UTC time and sanitized reproduction;
never request tokens or personal-data exports in a public issue. Review and
publish privacy/retention/provider-data terms with your actual hosting setup.
Active account deletion is implemented; backup expiry and restoration safeguards
must be operational before public release.

## Product extension smoke

Use disposable accounts for reset and deletion tests.
Test multi-indicator editing, costed backtests, comparison, benchmarks, exports, and watchlists.
Test session revocation, reset archives, and active-data deletion.

Enroll an additional passkey on the deployed HTTPS origin.
Do a login test with each key before and after an API restart.
Revoke another session and remove a spare key.
Do runner restart, repeated-job, stale-price, and provider-outage tests with fresh licensed data.

Do an API/web rollback drill in staging before release.
Record the revision, migration status, provider smoke results, backup drill, and rollback evidence.
Follow [RELEASE.md](../../RELEASE.md) for version, changelog, tag, and release-note steps.
