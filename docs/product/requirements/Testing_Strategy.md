# BitStockerz – Testing Strategy

This document describes the automated checks for the MVP, iOS app, and prelaunch features in this checkout.
Release configuration and mobile admission have local automated coverage. Hosted, signing, and physical-device gates remain open.
CI passing does not verify external hosting or real provider credentials.

## 1. Unit and component tests

API Jest tests cover configuration, auth identities, ingestion access, validation, indicators, rules, strategy versioning, and backtest computation.
They also cover persistence, financial accounting, idempotency, portfolio P&L, resource limits, caching, AI guardrails, and OpenAPI contracts. External providers use mocks
or locally signed tokens; unit tests do not require a live database or network.

Angular uses Vitest with file isolation, so vendor module mocks cannot share a real
module loaded by another spec. Coverage includes auth, API-origin token boundaries,
profile updates, symbol search, strategy/backtest/trading components, P&L mapping,
trade markers and chart teardown.

At PR #13, verified counts are 98 API suites / 910 tests and 20 web files / 93 tests.
The API's four configured global coverage thresholds are 90%. Coverage applies to
its configured collection scope: exclusions include auth service/module, AI and
selected wiring/scheduler files (see `apps/api/package.json`). Auth/AI behavior also has targeted unit, HTTP, signed-token, browser, and MySQL tests.
The percentage does not mean every application file is instrumented.

## 2. HTTP and signed-token integration

- `npm --prefix apps/api run test:e2e`: 67 HTTP tests at PR #13, with `NODE_ENV=test`
  and an explicitly empty `DATABASE_URL` through `test/setup-e2e.ts`.
- Routes cover health, auth/passkeys/OAuth/profile, symbols/candles, development
  jobs/ingestion, owner-scoped strategies/backtests/paper trading, AI and OpenAPI.
- Failure cases include validation, owner isolation, idempotency conflict, rate
  limits, production ingestion denial, unsafe config and bounded public errors.
- `npm --prefix apps/api run test:oauth`: 16 native signed-provider smoke tests
  against built code. Run the API build first; the larger verifier matrix also
  runs in the Jest suite.

## 3. Real MySQL persistence/security

CI starts a dedicated MySQL 8 service, applies every runnable Prisma migration,
then runs these required gates:

| Script in `apps/api`   | Checks                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `test:mysql:backtest`  | Transactional results/trades/equity, version pins and restart ownership                                                           |
| `test:mysql:trading`   | Account provisioning, concurrent idempotency, fills/rejections, P&L and restart snapshots                                         |
| `test:mysql:security`  | Explicit auth linking/restart/logout and concurrent persisted AI quota limits                                                     |
| `test:mysql:auth`      | Verifier/state/handoff ownership, original-session/age binding, recovery/replay, binary identifiers and expiry cleanup            |
| `test:mysql:mobile-admission` | Invitation binding, expiry/replay, concurrent redemption, rollback, restart hydration, and live admission/session revocation |
| `test:mysql:workspace` | Simulation/benchmark, watchlist, runner restart/idempotency, enrollment ownership, reset archive, export, deletion, and isolation |

Fixtures are isolated and cleaned up; use a test database. Local seed-mode gates
need no Docker. `KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify`
adds local MySQL migrations, backtest/trading/recovery gates and HTTP persistence
smoke, loading `apps/api/.env`. The separate `test:mysql:security` gate runs in CI;
invoke it explicitly for local auth/AI quota verification.
The verification script also omits workspace, mobile-admission, operator CLI, and iOS configuration gates. Run those separately.

## 4. Browser workflows

`npm --prefix apps/web run e2e` runs Playwright against actual API/web servers in seed mode.
The original five tests at PR #13 cover dashboard → strategy → backtest → Trade.
They also cover profile save/reload, mocked Google/Apple callbacks, recovery/link ownership, and failed-link session retention. Desktop/mobile manual checks complement automation.
See [manual_testing.md](../../manual-testing/manual_testing.md).
Product-extension tests add enrollment, research exports, charts, and paper-runner workflows.

The iOS research test adds a complete browser flow at phone width; see [iOS evidence](#ios-prototype-evidence).

External Google/Apple token exchange is mocked in automated browser tests. Real
signup, returning login, provider linking, Apple relay/second-login behavior,
lost-device recovery and original data retention require the deployed HTTPS
provider smoke checklist in [deployment.md](../../ops/deployment.md).

## 5. CI and release checks

`.github/workflows/ci.yml` runs on PRs and `main` and is reused by deployment:

- Checksum-pinned Gitleaks scans reachable history and the working tree with
  redacted output; only four reviewed historical false-positive fingerprints are
  exempted. GitGuardian also checked PR #13 through the installed integration; its current remote configuration was not inspected here.
- Root/API/web dependency audits fail at moderate severity or above.
- API build, lint, unit coverage, HTTP, native signed-token, fresh MySQL gates and
  production container build.
- Web lint, isolated unit tests, production build and Playwright browser tests.
- iOS configuration/artifact tests and private-beta proxy regressions. Native Xcode compilation remains a local check.

[PR #13 CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089380502)
and [post-merge main CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089882994)
passed on October 2, 2026.
The deployment workflow then failed at migration because hosting/database credentials were absent at that inspection. Live provider, proxy/IP, TLS,
market-data freshness and deployed latency checks remain launch requirements.

## Verification evidence

### November 4, 2026 — App-only configuration and mobile admission

Code and CI snapshot: `b1ce7c71e22373caefcfad54d66a08bd2512cf86`.
[CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/41916048123) and the GitGuardian integration passed all six checks for that revision.
These results are dated evidence; later changes require their own CI results.
The following local checks were recorded during the November 4 implementation.

| Check | Result |
| --- | --- |
| API build, Prisma validation, API/web lint | Passed locally |
| API unit tests | 1,022 passed with the existing coverage thresholds |
| API HTTP integration | 68 passed |
| Web unit tests | 125 passed |
| Browser integration | Eight passed against disposable local servers |
| iOS configuration/artifact tests | 11 passed locally; the macOS-specific shell test is skipped on Linux CI |
| Mobile operator CLI | Four passed, including private output, verified TLS configuration, and revocation |
| Disposable MySQL mobile admission | Migration, invitation races/replay/expiry, rollback, restart hydration, and live revocation passed |
| Staging native packaging | Guarded sync, unsigned simulator Release build, and built-app inspection passed at `b1ce7c7` |
| Staging simulator startup | Installation, launch, and visual sign-in inspection passed earlier at `d7c5346` |

Revocation tests cover direct and proxied requests, including mixed-case paths and `HEAD` dispatch.
Staging packaging used fixture HTTPS domains. Those hosts were not contacted.
The physical iPhone was unavailable during this run. No current signed-device, native-passkey, or real-provider acceptance was recorded.

The mobile admission flag remains disabled by default. Production deployment and Vercel retirement remain separate gates.

### Earlier verification records

Hosted evidence inspected October 8, 2026:

- [PR #15 CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37409503133) and
  [post-merge main CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37410465260) passed.
- Both runs applied all 19 migrations to fresh MySQL and passed all five persistence/security gates.
- API/web build, lint, tests, audits, secret scanning, browser tests, and the production-image build passed.
- [Deploy](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37410465419) failed because the migration step received an empty `DATABASE_URL`.
- Production monitoring skipped its checks because `PRODUCTION_API_BASE_URL` was absent.
  A successful skipped workflow is not production-health evidence.

Local checks on October 8, 2026 for Kernel and deployment readiness:

- API build and lint passed.
- API coverage passed: 106 suites, 975 tests; 98.01% statements and 90.03% branches.
- HTTP integration passed 67 tests; signed OAuth security passed 16 tests.
- Historical Kernel context remains pinned after edits, renames, and soft deletion.
  Improvement previews still use the current definition; foreign owners cannot invoke analysis.
- Native importer/operational checks passed 14 tests, including configuration and readiness failures.
- Angular production build passed with an injected HTTPS API origin; `dist/web/browser/index.html` was produced.
- Deployment YAML parsing and shell syntax passed. Documentation links, JSON/shell examples, formatting, and selected clarity checks passed.
- Local Docker remains unavailable. Fresh MySQL and container checks run in hosted CI.

Local checks on October 4, 2026:

| Check                                                 | Result                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| API build and lint                                    | Passed                                                                                                     |
| API unit/integration coverage                         | 106 suites, 974 tests passed; 98.01% statements and 90% branches under the existing coverage configuration |
| API end-to-end                                        | 67 tests passed                                                                                            |
| Signed OAuth token security                           | 16 tests passed                                                                                            |
| Import and operational CLI                            | 8 tests passed                                                                                             |
| Web build and lint                                    | Passed                                                                                                     |
| Web unit                                              | 22 files, 99 tests passed                                                                                  |
| Browser integration                                   | 7 tests passed, including independent virtual-passkey devices and both signing into the original account   |
| Prisma schema validation                              | Passed                                                                                                     |
| Root/API/web dependency audits                        | Zero vulnerabilities reported                                                                              |
| New MySQL migrations/restart harness                  | Prepared and included in CI; local execution blocked by unresponsive Docker daemon                         |
| Hosted CI, image build, live providers and deployment | Pending at this local snapshot; later hosted evidence is recorded above                                    |

Local browser fixtures use seed prices and disposable accounts. The browser test uses `localhost` as the relying-party domain, mapped to the IPv4 test server.
This avoids unrelated apps on an IPv6 loopback listener. Angular's native LMDB cache
crashed on this machine; local builds/tests used `NG_BUILD_CACHE_STORE=sqlite`
and `NG_BUILD_MAX_WORKERS=1`. Coverage thresholds and existing exclusions were
not reduced. No production data, provider credentials or real trading were used.

### Combined PR evidence

On October 12, PR #17 was retargeted to `main` with all PR #16 commits included. PR #16 was closed.

[CI at `cc64343`](https://github.com/JustinPaoletta/BitStockerz/actions/runs/38202881006) failed API and browser tests.
The API reported seven failed tests, including missing current seed prices; branch coverage was 89.55% against the 90% requirement.
Secret scanning, the root dependency audit, and encrypted recovery passed.
The October 14 correction excludes UTC weekends from synthetic daily equity age in price reads and health.
Crypto and database-backed prices retain strict elapsed-time rejection; the coverage threshold remains 90%.
Fixed-date tests cover Friday/Monday boundaries, eventual expiry, a custom threshold, and database rejection.

Local verification on October 14:

- The full API suite passed with the clock set to October 12 at 04:17 UTC: 108 suites, 993 tests.
- Branch coverage was 90.15%; statement coverage was 98.05%.
- Two additional configuration/database guards passed afterward; the final focused run passed all 65 market-data tests.
- All eight browser tests passed against an API fixed at the same Monday time, including trading, runners, and iOS research.
- API build and lint passed. An initial coverage attempt exhausted local cache space; the successful run disabled Jest disk caching.

Use the current PR checks for hosted validation of the pushed revision.
The earlier iOS evidence below remains historical.

### iOS prototype evidence

PR #17 at `33123e3d5e9fdb50e047afdfe973e3ef5620c4b9`:

- [Hosted CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/38072514866) passed; status was inspected again on October 11, 2026.
- The hosted gates include API/web tests, MySQL persistence, the production-image build, encrypted database recovery, audits, and secret scanning.
- GitGuardian also reported success on this revision. Neither result closes separate credential-rotation incidents.

Local evidence recorded October 10, 2026:

- API tests passed: 107 suites and 984 tests. Web tests passed: 25 files and 106 tests.
- API/web lint, API build, web production build, iOS web build, and two configuration tests passed.
- Three selected browser tests passed: `ios-research.spec.ts` and both tests in `product-extensions.spec.ts`.
- Browser coverage included real WebAuthn verification through virtual authenticators, charts, backtests, saved history, exports, and passkey recovery.
- iOS Simulator Debug and unsigned hardware Debug builds passed. The app launched on an iOS 26.5 simulator.
- Simulator email registration and authenticated research screens were inspected against the isolated API.

Chromium tests do not exercise AuthenticationServices, Apple's association lookup, or the native share sheet.
CI runs the configuration-generator tests behind `ios:test:config`. Native Xcode compilation remains a local check.
Signed installation, native passkeys, exports, and physical-device accessibility remain in the [iPhone checklist](../../../IOS_PROTOTYPE.md#iphone-acceptance-checklist).
These results do not establish production deployment or real-provider acceptance.

## App-only release acceptance

The [app delivery plan](../../../APP_ONLY_PLAN.md) defines the target gates; they are not completed by existing browser CI.
PR #19's final head `51e3c6a` passed six checks before merge into `59c4963`.
Its regression suite included 116 web tests and the profile-loading failure case in demo login.
Recorded physical-device evidence covered signed installation and the synthetic no-trades research journey.
That evidence does not cover production native passkeys, populated trades, Files exports, or physical-device accessibility.

Remaining acceptance evidence:

- Repeat invitation, revocation, wrong-RP, ownership, and restart checks against hosted staging with the intended native origins.
- Signed Release archive verification and installation through the intended distribution path.
- Real-device passkeys, chart/backtest/order/account journeys, including closed trades and no-trades outcomes.
- Interrupted writes, order idempotency, history reconciliation, backgrounding, force-quit, and network restoration.
- Export success/cancellation, temporary-file cleanup, larger text, VoiceOver, safe areas, and keyboard behavior.
- Current/previous installed app compatibility with backend updates and schema-compatible rollback.
- Actual licensed data, provider rights, host readiness, alert delivery, and restoration evidence.

Record device/OS, source SHA, app build, API image, data provenance, and observations with each device acceptance run.
Keep synthetic, browser, simulator, signed-build, physical-device, and production-provider evidence distinct.

## Native CLI regressions

From the repository root, run:

```sh
node --test apps/api/tools/*.test.mjs scripts/ops/*.test.mjs
node --test scripts/ios/*.test.mjs
```

These tests use fixtures and mocks; they do not establish live import or monitoring success.
