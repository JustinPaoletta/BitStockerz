# BitStockerz – Testing Strategy

This document describes the automated checks for the merged MVP and prelaunch
features. CI passing does not verify external hosting or real provider credentials.

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
| `test:mysql:workspace` | Simulation/benchmark, watchlist, runner restart/idempotency, enrollment ownership, reset archive, export, deletion, and isolation |

Fixtures are isolated and cleaned up; use a test database. Local seed-mode gates
need no Docker. `KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify`
adds local MySQL migrations, backtest/trading/recovery gates and HTTP persistence
smoke, loading `apps/api/.env`. The separate `test:mysql:security` gate runs in CI;
invoke it explicitly for local auth/AI quota verification.
The verification script also omits the new workspace and native CLI gates; run them separately.

## 4. Browser workflows

`npm --prefix apps/web run e2e` runs five Playwright tests at PR #13 against actual
API/web servers in seed mode. They cover dashboard → strategy → backtest → Trade,
profile save/reload, mocked Google/Apple callbacks, recovery/link ownership and
failed-link session retention. Desktop/mobile manual checks complement automation.
See [manual_testing.md](../../manual-testing/manual_testing.md).

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

[PR #13 CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089380502)
and [post-merge main CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089882994)
passed on October 2, 2026.
The deployment workflow then failed at migration because hosting/database credentials were absent at that inspection. Live provider, proxy/IP, TLS,
market-data freshness and deployed latency checks remain launch requirements.

## Verification evidence

Local checks on October 4, 2026:

| Check                                                         | Result                                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| API build and lint                                            | Passed                                                                                                     |
| API unit/integration coverage                                 | 106 suites, 974 tests passed; 98.01% statements and 90% branches under the existing coverage configuration |
| API end-to-end                                                | 67 tests passed                                                                                            |
| Signed OAuth token security                                   | 16 tests passed                                                                                            |
| Import and operational CLI                                    | 8 tests passed                                                                                             |
| Web build and lint                                            | Passed                                                                                                     |
| Web unit                                                      | 22 files, 99 tests passed                                                                                  |
| Browser integration                                           | 7 tests passed, including independent virtual-passkey devices and both signing into the original account   |
| Prisma schema validation                                      | Passed                                                                                                     |
| Root/API/web dependency audits                                | Zero vulnerabilities reported                                                                              |
| New MySQL migrations/restart harness                          | Prepared and included in CI; local execution blocked by unresponsive Docker daemon                         |
| Final-revision CI, image build, live providers and deployment | Pending                                                                                                    |

Local browser fixtures use seed prices and disposable accounts. The browser test uses `localhost` as the relying-party domain, mapped to the IPv4 test server.
This avoids unrelated apps on an IPv6 loopback listener. Angular's native LMDB cache
crashed on this machine; local builds/tests used `NG_BUILD_CACHE_STORE=sqlite`
and `NG_BUILD_MAX_WORKERS=1`. Coverage thresholds and existing exclusions were
not reduced. No production data, provider credentials or real trading were used.

## Native CLI regressions

From the repository root, run:

```sh
node --test apps/api/tools/import-market-data.test.mjs scripts/ops/check-health.test.mjs
```

These tests use fixtures and mocks; they do not establish live import or monitoring success.
