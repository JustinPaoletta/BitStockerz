# BitStockerz – Testing Strategy

This document describes the automated checks for the merged MVP and prelaunch
features. CI passing does not verify external hosting or real provider credentials.

## 1. Unit and component tests

API Jest tests cover configuration, auth/provider identity boundaries, ingestion
permissions, validation, indicators/rules, strategy versioning, backtest computation,
persistence orchestration, financial accounting/idempotency, portfolio P&L, resource
limits, caching, AI guardrails and OpenAPI contracts. External providers use mocks
or locally signed tokens; unit tests do not require a live database or network.

Angular uses Vitest with file isolation, so vendor module mocks cannot share a real
module loaded by another spec. Coverage includes auth, API-origin token boundaries,
profile updates, symbol search, strategy/backtest/trading components, P&L mapping,
trade markers and chart teardown.

At PR #13, verified counts are 98 API suites / 910 tests and 20 web files / 93 tests.
The API's four configured global coverage thresholds are 90%. Coverage applies to
its configured collection scope: exclusions include auth service/module, AI and
selected wiring/scheduler files (see `apps/api/package.json`). Auth/AI correctness
also has targeted unit, HTTP, signed-token, browser and MySQL regressions; a coverage
percentage is not a claim that every application file is instrumented.

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

| Script in `apps/api` | Checks |
| --- | --- |
| `test:mysql:backtest` | Transactional results/trades/equity, version pins and restart ownership |
| `test:mysql:trading` | Account provisioning, concurrent idempotency, fills/rejections, P&L and restart snapshots |
| `test:mysql:security` | Explicit auth linking/restart/logout and concurrent persisted AI quota limits |
| `test:mysql:auth` | Verifier/state/handoff ownership, original-session/age binding, recovery/replay, binary identifiers and expiry cleanup |

Fixtures are isolated and cleaned up; use a test database. Local seed-mode gates
need no Docker. `KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify`
adds local MySQL migrations, backtest/trading/recovery gates and HTTP persistence
smoke, loading `apps/api/.env`. The separate `test:mysql:security` gate runs in CI;
invoke it explicitly for local auth/AI quota verification.

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
  exempted. GitGuardian also checks PRs through the installed GitHub integration.
- Root/API/web dependency audits fail at moderate severity or above.
- API build, lint, unit coverage, HTTP, native signed-token, fresh MySQL gates and
  production container build.
- Web lint, isolated unit tests, production build and Playwright browser tests.

[PR #13 CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089380502)
and [post-merge main CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089882994)
passed. The deployment workflow subsequently failed at migration because production
hosting/database credentials are unconfigured. Live provider, proxy/IP, TLS,
market-data freshness and deployed latency checks remain launch requirements.
