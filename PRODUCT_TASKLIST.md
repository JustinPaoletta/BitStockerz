# BitStockerz — Remaining product tasks

Created October 3, 2026. Updated October 5, 2026.
This checklist contains unfinished work from the roadmap and product assessment.
Delivered local features are described in [product extensions](docs/product/PRODUCT_EXTENSIONS.md).

Use the [deployment runbook](docs/ops/deployment.md) for setup procedures.
Local test evidence is recorded in the [testing strategy](docs/product/requirements/Testing_Strategy.md#verification-evidence).
No live-provider success or production deployment is recorded.

## Release evidence still required

- [ ] Run the new migrations and all five MySQL persistence/restart harnesses against a disposable database.
- [ ] Obtain passing CI on the final revision, including secret scanning and the production-image build.

## 1. Remaining roadmap work — Required for launch

### Production hosting and configuration — Sprint 7.2

- [ ] Provision the always-on Fly.io API application.
- [ ] Provision managed MySQL near the API, with foreign keys, serializable transactions, and Prisma migration support.
- [ ] Create the Vercel Angular project and configure its build/output paths and SPA rewrites.
- [ ] Establish the production HTTPS URLs used by the website, API, passkeys, and OAuth callbacks.
- [ ] Configure the GitHub `production` environment with `DATABASE_URL`, `FLY_API_TOKEN`, `API_BASE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` using secret storage.
- [ ] Configure API host settings for the database, exact CORS origins, WebAuthn relying-party ID/allowed origins, and scheduled-job system user.
- [ ] Determine the actual trusted ingress proxy CIDRs and configure `TRUSTED_PROXY_CIDRS` accordingly.
- [ ] Disable development email auth, legacy WebAuthn bypasses, forced-error routes, and public OpenAPI in production using the runbook defaults.
- [ ] Keep one API instance while auth caches, rate limits, and scheduling remain process-local.
- [ ] Keep ingestion scheduling disabled until live ingestion passes its checks.
      Keep live Kernel AI disabled until its optional rollout is completed.

### Real market data

The licensed-data importer and Alpaca adapter are implemented. Credentials, feed
entitlement, launch data, and live verification remain outstanding. Scheduling
and live data remain disabled by default.

- [ ] Select a legitimate market-data source and confirm permission to use its historical equity/crypto data in the product.
- [ ] Populate the supported symbol directory and daily equity plus daily/hourly crypto OHLCV history.
- [ ] Verify imported data coverage, timestamps, OHLCV sanity, and market-data health for the advertised symbols and date ranges.
- [ ] Verify charts, backtests, and paper trades use the imported real prices.
- [ ] Verify production never substitutes synthetic seed data when real data is unavailable.

### Google/Apple configuration and production verification — Sprints 8.1–8.2

Browser login, profile editing, and linked-provider recovery are implemented.
The tasks below cover their outstanding provider setup and live verification.

- [ ] Configure the Google web OAuth client, consent/branding settings, API callback URL, and host credentials.
- [ ] Configure Apple Sign in with Apple, Services ID/domain, API form-POST callback URL, and host signing credentials.
- [ ] Configure `AUTH_OAUTH_BROWSER_CALLBACK_URL` to the exact production SPA callback and verify direct navigation/refresh works.
- [ ] If migrating an existing database, run the duplicate-provider identity preflight and resolve conflicts before applying the uniqueness migration.
- [ ] Verify `/api/auth/providers` exposes only fully configured providers.
- [ ] Test new signup and returning login with each enabled real provider; confirm exactly one user and paper account are provisioned.
- [ ] Verify email collisions require existing-account sign-in and explicit linking rather than silently attaching identities.
- [ ] After a fresh passkey sign-in, link each enabled provider.
      Confirm lost-device recovery returns the original account, cash, strategies, and backtests.
- [ ] Repeat login/recovery after an API restart to prove persistence and hydration.
- [ ] Test Apple relay email and returning login without Apple's first-login form payload.
- [ ] Do denial/cancellation, expired-callback, refresh/replay, failed-link, and five-minute sign-in tests.
      Failed links must preserve the existing session.
- [ ] Confirm profile display-name persistence and desktop/mobile keyboard flows.
      Make sure callback URLs and logs contain no bearer tokens or identity payloads.
- [ ] Record live smoke results separately for Google and Apple.

### First deployment, production smoke, and release

- [ ] Run the applicable release gates and obtain passing CI on the release revision.
- [ ] Apply and verify production migrations, deploy the API, and restart it once to verify database-backed auth hydration.
- [ ] Build/deploy the Angular site with the verified production API URL and complete the deployment workflow successfully.
- [ ] Verify `/api/health/live` and `/api/health/ready` report healthy/ready with the database connected.
- [ ] Verify passkey registration/login on the deployed HTTPS domain and a complete strategy → backtest → results workflow.
- [ ] Verify symbol search, real-data charts, paper orders, positions, portfolio P&L, and history in production.
- [ ] Verify SPA deep-link refresh and browser API calls/CORS preflight against the production origin.
- [ ] Verify auth rate limits distinguish real client IPs and spoofed forwarded hops cannot choose an arbitrary rate-limit identity.
- [ ] Verify production manual jobs/ingestion endpoints return 403 and public outage responses omit credentials, hostnames, and driver errors.
- [ ] Verify website framing, MIME-sniffing, and referrer security headers.
- [ ] Complete the version, changelog, tag, and release-note steps in `RELEASE.md` for the first production release.
- [ ] Update roadmap/readiness documentation with the actual deployment and provider verification results.

## 2. Remaining roadmap extensions — Optional for the initial launch

### Automated vendor ingestion

- [ ] Configure vendor credentials and verify incremental ingestion, provider guardrails, and degraded health using real data.
- [ ] Enable scheduled ingestion only after the adapter works, and verify exactly one scheduled job/audit event runs per interval.

### Kernel correctness and optional live rollout

- [ ] Make backtest explanations use the pinned strategy version; add a regression for later strategy edits.

- [ ] Configure the OpenAI provider and key in host secret storage when enabling live Kernel AI.
- [ ] Verify live strategy explanations, logic warnings, backtest explanations, failure modes, and improvement suggestions.
- [ ] Verify structured-output validation, usage limits, timeouts, safe logging, and user-facing disclaimers with the real provider.
- [ ] Obtain owner/legal inspection of the final public disclaimer before enabling Kernel.
- [ ] Confirm operating-cost limits and enable `AI_ENABLED` after live verification.

### Additional passkeys — Sprint 8.2 optional extension

- [ ] Verify additional passkeys on deployed HTTPS devices and after a MySQL-backed API restart. Local cryptographic browser verification is tracked separately.

## 3. Forward paper execution

Local paper-runner code is implemented. Persistent and production acceptance remain pending.

### Run saved strategies in paper trading — High priority if automation is central

Paper runners now pin saved versions and use completed bars, account risk limits,
durable order intent and close-based risk exits. Scheduling requires database
persistence and functioning ingestion. See the limitations in the extension contract.

- [ ] Verify repeated jobs, restarts, and unavailable/stale market data cannot create duplicate or misleading executions.

## 4. Public-release readiness

Existing logs, health checks, and rollback documentation provide a foundation;
these tasks establish usable production operations and user support.

- [ ] Configure automated database backups and document their retention and restore procedure.
- [ ] Perform a backup restoration drill and verify recovered users, auth methods, strategies, backtests, and paper-account balances.
- [ ] Exercise the API/web rollback procedure against a real deployment and verify database compatibility.
- [ ] Configure actionable operational alerts for service failures, database outages, stale/failed ingestion, and enabled AI-provider failures or usage limits.
- [ ] Configure a public support channel accessible to customers and publish contact details.
- [ ] Publish actual host log/backup retention periods and implement the operator deletion record used when restoring backups.
