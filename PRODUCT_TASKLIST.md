# BitStockerz — Remaining product tasks

Created October 3, 2026. Updated October 29, 2026.
This checklist contains unfinished work from the roadmap and product assessment.
Delivered features are described in [product extensions](docs/product/PRODUCT_EXTENSIONS.md).

Use the [deployment runbook](docs/ops/deployment.md) for setup procedures.
Local test evidence is recorded in the [testing strategy](docs/product/requirements/Testing_Strategy.md#verification-evidence).
No live-provider success or production deployment is recorded.

The first launch is a private personal research beta. The hosting budget is $10/month maximum, with free services preferred.
The October 9 inspection recorded Fly's empty app, Aiven Free MySQL, and the Vercel Hobby project.
Production credentials were stored, and deployment was disabled. Cloud state was not inspected again during the October 11 documentation cleanup.
See [current setup and approvals](docs/ops/deployment.md#current-setup-and-next-approvals) for evidence and the remaining decisions.

## Delivered baseline and release evidence

- [x] Merge the original Capacitor prototype in PR #17.
- [x] Merge branding and evidence-led copy in PR #18.
- [x] Merge the Personal Team demo and login fallback fix in PR #19 (`59c4963`).

PR #19 recorded a signed installation and synthetic research journey on iPhone 15 Pro.
Its final head `51e3c6a` passed six checks before squash merge.
The recorded backtest had no closed trades. Native passkeys, exports, accessibility, and a populated trade table require device acceptance.
These historical results do not prove production deployment or real-provider success.

## App-only launch decision and stage gates

Updated October 29, 2026. The launch product is an iPhone app for private personal research.
[APP_ONLY_PLAN.md](APP_ONLY_PLAN.md) defines the complete implementation plan, dependencies, risks, and completion criteria.
The existing Angular interface stays bundled in Capacitor. Browser builds remain development and test tools.
Android, subscriptions, offline mutation queues, notifications, and a native UI rewrite are outside the initial release.

## A. App configuration — Required

- [ ] Define explicit simulator, demo, staging, and production configuration contracts and implement missing modes.
- [ ] Keep demo and production bundle identities separate; generate RP, API origin, team, version, and build number.
- [ ] Reject release artifacts containing test login, demo keys, localhost, temporary tunnels, or placeholder RP domains.
- [ ] Preserve bundled assets and restrict native bridge navigation; record source/configuration evidence with each build.

## B. Production mobile access — Required before removing the proxy perimeter

- [ ] Implement persistent server-side beta admission and hashed, expiring enrollment invitations.
      Bootstrap the single owner through an operator tool; no email service or administration UI is required for the first beta.
- [ ] Bind invitations to passkey verification and consume them atomically; reject replay, concurrent use, expiry, and revocation.
- [ ] Enforce admission, session validity, and tenant ownership; email alone must not authorize enrollment or recovery.
- [ ] Verify admission revocation affects existing sessions and survives MySQL-backed restart.
- [ ] Configure native transport, exact CORS, RP verification, ingress trust, and authentication rate limits.
- [ ] Keep operator jobs private and test cross-user access, wrong RP, cancelled enrollment, expiry, and secret-free artifacts.

## C. Backend, native passkeys, and real data — Required for meaningful beta

Use disposable staging accounts until Stage F backup, retention, and recovery gates pass.

### Production hosting and configuration — Sprint 7.2

- [ ] Approve the actual Fly operating cost and activate one API machine after the remaining release checks.
- [ ] Pass the protected Linux migration-engine check against Aiven, then apply the 19 migrations during deployment.
      The API client connects with verified TLS. The macOS migration engine rejects the CA; Linux verification remains pending.
- [ ] Prove uninvited and revoked users cannot access the mobile API; retain the legacy perimeter until replacement acceptance passes.
- [ ] Establish stable HTTPS API and passkey hosts plus public association, privacy, and support resources.
- [ ] Set `PRODUCTION_API_BASE_URL` after licensed data is ready; enable `PRODUCTION_DEPLOY_ENABLED` only after setup and approval.
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

### First deployment, production smoke, and release

- [ ] Obtain passing CI on the release revision, including secret scanning, MySQL gates, and the production-image build.
- [ ] Apply and verify production migrations, deploy the API, and restart it once to verify database-backed auth hydration.
- [ ] Bundle the verified production API configuration into a signed iOS Release build; complete separate API and app release gates.
- [ ] Verify `/api/health/live` and `/api/health/ready` report healthy/ready with the database connected.
- [ ] Verify native passkey registration/login against the associated domain and complete strategy → backtest → results on the iPhone.
- [ ] Verify symbol search, real-data charts, paper orders, positions, portfolio P&L, and history in production.
- [ ] Verify native API calls, transport/CORS behavior, supported app navigation, and restart recovery against production.
- [ ] Verify auth rate limits distinguish real client IPs and spoofed forwarded hops cannot choose an arbitrary rate-limit identity.
- [ ] Verify production manual jobs/ingestion endpoints return 403 and public outage responses omit credentials, hostnames, and driver errors.
- [ ] Verify HTTPS and appropriate security headers on public policy/association resources; restrict native bridge navigation.
- [ ] Complete the version, changelog, tag, and release-note steps in `RELEASE.md` for the first production release.
- [ ] Update roadmap/readiness documentation with the actual deployment and provider verification results.

### Native passkey prerequisites — Required for the persistent app

- [ ] Select the stable HTTPS relying-party domain and reachable persistent API.
- [ ] Make the paid developer team available and publish/check the association file for the persistent app identity.
- [ ] Complete real passkey registration, cancellation, login, and app/API restart checks on a physical iPhone.
- [ ] Complete populated-trade, no-trade, saved history, export, and accessibility acceptance separately from demo evidence.

## D. Phone behavior — Required alongside backend acceptance

- [ ] Complete the physical-device research, strategy, backtest, paper trading, and account-control journeys.
- [ ] Verify cold-launch sign-in, expiry, revocation, and safe retry states under the initial memory-only session policy.
- [ ] Preserve order idempotency after lost responses; reconcile ambiguous strategy/backtest writes before retrying.
- [ ] Define recovery of submitted backtests after termination; add durable request/status contracts if needed.
- [ ] Verify server runners continue safely while the app is backgrounded or terminated.
- [ ] Test keyboard, safe areas, chart interaction, supported orientation, light/dark mode, larger text, and VoiceOver.
- [ ] Test export/save/cancel in Files and temporary-file cleanup, including after restart.
- [ ] Test airplane mode, Wi-Fi/cellular changes, backgrounding, force-quit, network restoration, and input preservation.
- [ ] Verify account reset, archives, deletion, export, and session revocation through the app.
- [ ] Measure startup, chart responsiveness, memory, and representative backtest latency; set evidence-based thresholds.

## E. Release automation and compatibility — Required

- [ ] Split API deployment from Vercel in `deploy.yml` and `check-deploy-config.mjs`, including tests, after Stage B passes.
- [ ] Retain protected approvals, migrations, health smoke, audits, and secret scanning; add native Xcode compilation gates.
- [ ] Produce a reproducible signed Release archive and separate backend deployment from app distribution approval.
- [ ] Verify current/previous app compatibility with additive API/schema changes and compatible rollback.
- [ ] Document rollout pause and forward-fix recovery because installed apps cannot be recalled like website assets.
- [ ] Verify Vercel has no runtime, domain, policy, support, OAuth, or monitoring dependency before retirement.
- [ ] Remove unused Vercel/proxy secrets and revoke obsolete tokens after the replacement path is accepted.

## F. Operational readiness — Before storing valuable beta data

Prepare this work alongside Stage C. Complete it before valuable-data acceptance or tester distribution.

Existing logs, health checks, and rollback documentation provide a foundation;
these tasks establish usable production operations and user support.

- [ ] Select independent backup storage, private-key custody, an export schedule and retention before storing valuable beta data.
      Aiven Free has a single disaster-recovery backup and no database forks.
      Encrypted export tooling and a disposable MySQL recovery drill are prepared; actual Aiven recovery remains pending.
- [ ] Perform a backup restoration drill covering users, auth methods, admission, strategies, backtests, and paper balances.
      Invalidate restored sessions/invitations/challenges and replay deletion records before reopening access.
- [ ] Exercise API rollback with the current schema and installed app versions; document app rollout pause and a forward-fix release.
- [ ] Test alert delivery for service failures, database outages and stale ingestion after deployment.
      Aiven project admins receive provider alerts. The GitHub monitor has a separate key limited to market-data health.
- [ ] Configure a public support channel accessible to customers and publish contact details.
- [ ] Publish actual host log/backup retention periods and implement the operator deletion record used when restoring backups.

### F. TestFlight distribution — After persistent device acceptance and owner approval

- [ ] Create the App Store Connect app record, confirm paid signing access, and complete required agreements.
- [ ] Upload an approved build, supply beta information and feedback contact, and select testers.
- [ ] Complete external beta review if required; schedule replacement builds before their 90-day expiry.
- [ ] Verify tester installation, upgrade, and the persistent journey on the distributed build.

## G. Public App Store release — Separate from the private beta

- [ ] Prepare metadata, screenshots, age rating, export-compliance answers, and review access.
- [ ] Publish privacy-policy and support URLs and complete accurate app privacy disclosures.
- [ ] Audit dependency privacy manifests and required-reason API declarations.
- [ ] Verify in-app account deletion and published retention against live storage and backup behavior.
- [ ] Provide approved reviewer access and maintain backend availability during review.
- [ ] Obtain owner approval for public submission and release.

## Optional extensions — Separate acceptance after the private beta

### Native providers, recovery, and persistent sessions

Browser OAuth is implemented. Native provider login/linking is not enabled.
The first private beta uses passkeys. Before adding provider login:

- [ ] Define native sign-in/linking and callback contracts; review Apple's current equivalent-login requirements.
- [ ] Configure each provider's native app identity, required server credentials, consent, and branding.
- [ ] Run duplicate-provider identity preflight before migrating an existing database.
- [ ] Expose only configured providers; verify first signup and returning login create one user and paper account.
- [ ] Require fresh existing-account authentication before explicit provider linking; email collisions must not silently attach identities.
- [ ] Verify lost-device recovery returns the original account, cash, strategies, and results, including after API restart.
- [ ] Test Apple relay email and returning login without first-login profile data.
- [ ] Test denial, cancellation, expiry, replay, failed linking, and expired recent-authentication windows; preserve the original session on failure.
- [ ] Verify profile persistence, mobile keyboard behavior, safe callbacks, and credential-free logs; record each provider's live results.
- [ ] Design Keychain-backed persistent sessions only if needed, including expiry, rotation, revocation, logout, and backup behavior.

### Automated vendor ingestion

- [ ] Configure vendor credentials and verify incremental ingestion, provider guardrails, and degraded health using real data.
- [ ] Enable scheduled ingestion only after the adapter works, and verify exactly one scheduled job/audit event runs per interval.

### Kernel correctness and optional live rollout

- [ ] Configure the OpenAI provider and key in host secret storage when enabling live Kernel AI.
- [ ] Verify live strategy explanations, logic warnings, backtest explanations, failure modes, and improvement suggestions.
- [ ] Verify structured-output validation, usage limits, timeouts, safe logging, and user-facing disclaimers with the real provider.
- [ ] Obtain owner/legal inspection of the final public disclaimer before enabling Kernel.
- [ ] Confirm operating-cost limits and enable `AI_ENABLED` after live verification.

### Additional passkeys — Sprint 8.2 optional extension

- [ ] Verify additional passkeys on deployed HTTPS devices and after a MySQL-backed API restart. Local cryptographic browser verification is tracked separately.

### Forward paper execution

Paper-runner code and MySQL restart/idempotency gates passed CI. Production acceptance remains pending.

#### Run saved strategies in paper trading — High priority if automation is central

Paper runners now pin saved versions and use completed bars, account risk limits,
durable order intent and close-based risk exits. Scheduling requires database
persistence and functioning ingestion. See the limitations in the extension contract.

- [ ] Verify repeated jobs, restarts, and unavailable/stale market data cannot create duplicate or misleading executions in production.
