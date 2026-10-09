# What you still need to do (go-live)

MVP features merged through PR #13. Research, runners, watchlists, and account controls
merged in [PR #15](https://github.com/JustinPaoletta/BitStockerz/pull/15).
The remaining launch work requires hosting, credentials, licensed data, and deployed acceptance tests.

**Inspection — October 8, 2026:** PR #15 and
[post-merge main CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37410465260)
passed, including all 19 migrations, five MySQL gates, and the production-image build.
The subsequent [Deploy run](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37410465419)
failed at migration because `DATABASE_URL` was empty.
Production monitoring skipped because `PRODUCTION_API_BASE_URL` was absent.
Neither result establishes a running production service.
The October 2 inspection previously found no hosting or production credentials.
This inspection did not inspect cloud accounts or reveal secret values.

Start here. Technical detail is further down.

## Big picture

BitStockerz has three production pieces:

1. **Website** (Angular) → hosted on **Vercel**
2. **API** (NestJS + scheduled jobs) → hosted on **Fly.io**
3. **Database** (MySQL) → a **managed MySQL** service near the API

The repo already has CI, Docker, Fly config, Vercel config, and deploy workflows.
These files are deployment instructions; they do not provision cloud accounts,
an API app, a website project or a database. `deploy.yml` runs CI after pushes to `main` and accepts manual runs on `main`.
Deployment stays deferred until repository variable `PRODUCTION_DEPLOY_ENABLED` equals `true`.

After enabling it, a configuration check rejects missing settings before migration.
A deferred run records setup status and does not establish deployment success. CI success and a
merged PR do not mean the product is live.

## Launch setup

### 1. Create the three cloud pieces (accounts)

You need sign-ups / projects on:

| Piece      | Host                             | Resource                                                                                                                                             |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| API server | [Fly.io](https://fly.io)         | One app that runs the API 24/7 (keep **one** machine while the built-in scheduler is on)                                                             |
| Database   | Managed MySQL-compatible service | A database in the **same region** as the Fly app (default docs use `iad`), with foreign keys, serializable transactions and Prisma migration support |
| Website    | [Vercel](https://vercel.com)     | A CLI-linked project that receives the `apps/web` upload; project Root Directory `.`                                                                 |

You will end up with:

- An API URL (example shape: `https://something.fly.dev`)
- A website URL (example shape: `https://something.vercel.app`)
- A database connection string (`DATABASE_URL`)

Select a unique Fly app name. The workflow uses repository variable `FLY_APP_NAME`
instead of the template app name. Keep the API and managed MySQL in the same region.
If changing regions, update `primary_region` in `apps/api/fly.toml` before deployment.
The database must be reachable from both GitHub's migration runner and Fly.

Use the provider's secure connection requirements and least-privilege database credentials.
A private database requires a prepared migration network path; the workflow does not create one.

From `apps/web`, link the Vercel project after installing the pinned CLI:

```sh
npx vercel@63.1.0 link
```

Use interactive account authentication; do not paste tokens into shell commands.
The CLI upload starts at `apps/web`, so the Vercel project's Root Directory must be `.`.
Build Command is `npm run build -- --configuration production`.
Output Directory is `dist/web/browser`. Install Command is `npm ci`.

These settings and SPA rewrites are committed in `apps/web/vercel.json`.
The ignored `.vercel/project.json` contains the org/project IDs for GitHub configuration.
Separate Vercel Git deployments are disabled so they cannot bypass API readiness and URL injection.
Project linking does not authorize the first production deployment.

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

**Never commit these into git or send them in chat.**
Use [GitHub environment settings](https://github.com/JustinPaoletta/BitStockerz/settings/environments)
for the six secrets. The preflight prints only missing names or fixed validation codes.
`DATABASE_URL` must select MySQL and a named database; `API_BASE_URL` must be an HTTPS origin.
The check does not authenticate credentials or confirm provider reachability.

Set these repository variables under **Settings → Secrets and variables → Actions → Variables**:

| Variable                    | Value                            | When                                                                 |
| --------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `FLY_APP_NAME`              | Your provisioned Fly app name    | Before enabling deployment                                           |
| `PRODUCTION_API_BASE_URL`   | The same public HTTPS API origin | After the API and licensed data are ready                            |
| `PRODUCTION_DEPLOY_ENABLED` | `true`                           | After hosting, runtime settings, secrets, and backups are configured |

Keep `PRODUCTION_DEPLOY_ENABLED` absent or `false` during setup.
Restrict the `production` environment to `main`.
Use environment reviewers if your release policy requires them.
Enabling deployment permits later merges to deploy automatically after CI.
If needed, set the variable to `false` to stop future automatic deployments.
An existing in-progress deployment must be stopped separately.

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

After the release-readiness changes are merged, complete sections 1–3 and configure automated backups.
Set `PRODUCTION_DEPLOY_ENABLED=true` only when you are ready to release.
Open [Deploy](https://github.com/JustinPaoletta/BitStockerz/actions/workflows/deploy.yml).
Select **Run workflow**, select `main`, and start the run.
The workflow repeats CI, checks configuration, applies migrations, deploys API, and tests readiness before deploying the website.
A missing setting must produce a sanitized configuration issue; do not skip that check.

The API deployment uses `--ha=false --strategy immediate` to avoid spare machines and overlapping schedulers.
Immediate replacement causes brief downtime. Confirm exactly one machine remains after deployment.
Existing extra machines must be removed through the Fly dashboard before enabling scheduled jobs.
See [Fly deploy options](https://fly.io/docs/flyctl/deploy/) for these flags.

Then complete these acceptance steps:

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
| `#6.4.2` AI change previews       | Merged in PR #15 under a disabled flag; live verification pending                                                                                                                                                            |

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
3. Run `scripts/ops/check-deploy-config.mjs` before installing deployment tools or applying migrations.
4. Apply `prisma migrate deploy` once; inspect `prisma migrate status`.
5. Deploy API; wait for `/api/health/live` and `/api/health/ready`.
6. Build web with `environment.prod.ts` `apiBaseUrl` set to the verified API.
7. Deploy web to Vercel production.

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

Before each release, record the source SHA, Fly image digest, Vercel deployment ID, migration status, backup ID, and smoke results.
A git SHA alone does not identify the deployed container image.
Keep the previous compatible image available before applying migrations.
Pinning CLI versions does not prove live deployment acceptance.

1. Set `PRODUCTION_DEPLOY_ENABLED=false` and stop any running deployment.
   Pause ingestion and runners; keep `AI_ENABLED=false` during incident recovery.
2. Inspect schema compatibility in an isolated restore with the previous API binary.
   Test auth, historical strategy pins, account cash, positions, orders, and idempotent retries.
   Do not apply reverse migrations or remove customer rows to roll back code.
3. Select the recorded Fly image digest. Use the actual app name:

   ```sh
   flyctl deploy --app "$FLY_APP_NAME" --config apps/api/fly.toml --image "$PREVIOUS_API_IMAGE" --ha=false --strategy immediate
   ```

   Supply deployment credentials through the normal host/secret manager.
   Use `PREVIOUS_API_IMAGE` from the release record; do not substitute an untested tag.

4. From the Vercel project dashboard, roll back to the recorded compatible production deployment.
   Make sure its embedded API origin and OAuth callback origin match the restored topology.
5. Repeat database readiness, auth/recovery, deep-link, chart, backtest, and paper-ledger smoke checks.
   Confirm one Fly machine and paused scheduling before resuming any work.
6. Record incident time, selected artifacts, schema compatibility, results, and recovery duration.
   Resume scheduling and automatic deployment only after the checks pass.

A staging rollback drill remains required before public release.
See [Vercel rollback](https://vercel.com/docs/instant-rollback).

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

All 19 migrations and five MySQL harnesses passed PR #15 and post-merge main CI.
Local Docker was unavailable. Hosted CI provides disposable-database evidence.
For a local repeat, start Docker Desktop or supply a disposable MySQL 8 database. Never point test harnesses at production or a valued database.
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
Passing CI on each release revision remains required. Three new migrations add
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

### Restoration drill

1. Configure encrypted automated backups and an operator with restricted restore access.
   Record provider, region, backup schedule, retention, encryption, and failure-alert recipient.
   Record the measured RPO/RTO targets; do not publish the example retention periods as promises.
2. Create staging fixture users with passkeys/providers, strategy versions, backtests, and paper positions.
   Save a restricted expected snapshot of identifiers, counts, decimal balances, and order IDs.
   Record the backup ID, UTC capture time, application SHA, and image digest.
3. Restore that backup into a new isolated database through the provider's restore procedure.
   Never overwrite production during a drill. Record restore start/end times and migration status.
   Use a separate Fly app/origin; keep scheduling, live ingestion, and live AI disabled.
4. Reapply deletion requests made after the backup capture before starting the restored application.
   Use the restricted deletion record below. Account deletion also removes child records and invalidates caches.
   Clear restored auth sessions and one-use OAuth/passkey challenges with the recovery operator's approved database procedure.
   Old session tokens and callback codes must not become valid again after restoration.
5. Compare users, auth identities, and strategy versions with the expected snapshot.
   Compare backtest results, trades, equity, order IDs, quantities, and cash.
   Confirm deleted users and their child records are absent.
   Do not run fixture-creating MySQL test harnesses against a restored customer database.
6. Start the isolated API with the recorded compatible binary.
   Test fresh login, account recovery, historical export, cash/position balances, and repeated order IDs.
   Restart the API and repeat the ownership and ledger checks.
7. Record recovered backup time, data loss, recovery duration, discrepancies, and pass/fail.
   Keep the restored database isolated if any check fails.
   Delete staging resources through the provider after capturing sanitized evidence.

Provider restore instructions must be filled in after selecting managed MySQL:

| Required record      | Owner supplies                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Restore procedure    | Provider documentation and exact console action                                                |
| Backup selection     | Backup ID and capture time                                                                     |
| Recovery destination | Isolated database/app names and region                                                         |
| Operator access      | Named operator and restricted role; no passwords                                               |
| Acceptance record    | Snapshot location, comparison results, deletion replay, session invalidation, measured RPO/RTO |

### Deletion record for recovery

Keep this record in restricted durable storage outside application backups and git.
Use account UUID, confirmed deletion time, and backup-expiry date; omit email, tokens, and personal exports.
The owner must select durable storage, permissions, retention, and the responsible operator.
This repository cannot select those account-specific settings.
The following record format is prepared for that setup:

```json
{
  "user_id": "00000000-0000-4000-8000-000000000001",
  "deleted_at": "2026-10-08T12:00:00.000Z",
  "purge_after": null
}
```

`purge_after` stays unset until all backups containing that user have expired.
Retain the record while any retained backup could restore that account.

Record confirmed deletions before declaring recovery controls complete.
If that record is unavailable, keep the restored database offline.
The application does not yet write to an external deletion journal.
Storage configuration and operational capture remain owner prerequisites.
Purge expired backups and logs according to the published policy.

### Alerts and support

Set the repository variable `PRODUCTION_API_BASE_URL` to the public API origin
without a trailing slash for the prepared 15-minute health workflow. This read-only
monitor uses a public URL, so it can run without deployment-environment approval. Enable GitHub Actions failure
notifications for a named recipient and run it manually once. Add host-native
alerts for API/database failures, ingestion jobs, stale feeds and optional AI
failures/limits. Record severity, on-call recipient, escalation, and recovery steps.
Use this initial alert matrix after setting provider-specific thresholds:

| Trigger                                          | Recipient/action                                   | Recovery evidence                                     |
| ------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------- |
| Liveness or database readiness fails             | Operator; inspect Fly/DB status                    | Ready with database up; auth and ledger checks pass   |
| Stale/empty market data or provider circuit open | Operator; pause runners and scheduling             | Licensed series fresh; one ingestion job per interval |
| Backup failure or overdue backup                 | Recovery operator; repair provider backup schedule | Successful encrypted backup and a restoration drill   |
| Enabled AI failures or quota/cost limit          | Operator; disable live AI                          | Bounded provider requests and owner-approved budget   |

Enable GitHub workflow-failure notifications for the operator.
Send a test alert through each configured host notification channel.
Record delivery and recovery; a skipped health workflow does not test alert delivery. The GitHub check is a baseline, not a substitute for these alerts.

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

## Owner handoff and release evidence

Complete sections 1–3 in order: Fly app, managed MySQL, Vercel project, HTTPS origins,
GitHub secrets/variables, then matching Fly runtime settings.
Complete Google/Apple configuration for each provider you advertise.
Supply licensed history before opening charts/backtests to customers.
Select public support contact, backup/log retention, and the external deletion record.
Optional Kernel setup additionally needs a provider key, budget, and disclaimer acceptance.

Keep this evidence in restricted operator storage; put only sanitized results in repository documentation:

| Evidence      | Record                                                                                |
| ------------- | ------------------------------------------------------------------------------------- |
| Release       | Source SHA, draft PR/CI URL, API image digest, Vercel deployment ID                   |
| Database      | Migration status, provider/region, backup ID/time, restore drill results              |
| Auth          | HTTPS origins/RP ID, enabled providers, login/recovery/restart results                |
| Data          | Source and license reference, symbols/ranges, coverage/freshness results              |
| Operations    | Single instance, alerts and recipients, retention, deletion replay, rollback drill    |
| Product smoke | Charts, strategy/backtest, comparisons/exports, passkeys, paper ledger, runner checks |

Mark a task complete only after recording its acceptance evidence.
Do not include credentials or customer identifiers in a PR, issue, or public release note.
