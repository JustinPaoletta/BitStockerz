# Prelaunch security review — October 2, 2026

Reviewed the repository and P&L, chart, browser OAuth and profile/recovery changes
merged in [PR #13](https://github.com/JustinPaoletta/BitStockerz/pull/13), following
PR #12. This review covers source, migrations,
configuration, deployment/build inputs, dependency lockfiles, reachable Git history
and intended working-tree files. It does not inspect live provider dashboards,
host secrets, production traffic or external infrastructure.

## Secrets and dependency results

- Gitleaks 8.30.1, downloaded from its official release and checksum-verified,
  found no confirmed exposed credentials in the working tree or reachable history.
- Four historical matches were reviewed: two synthetic invalid bearer examples in
  manual-testing docs and two public Nest scaffold badge URL tokens. Their exact
  fingerprints are recorded in `.gitleaksignore`; no files or provider rules are
  broadly exempted. Scanner output stays redacted.
- Root and API dependency audits pass on CI. The frontend audit identified
  GHSA-ch52-4w7c-c8xp in the Angular 21 registry-cache toolchain; its upstream
  dependency has no patched release. Upgrading Angular framework/build tools
  together to 22.2.1 removes that dependency, with the official Eager migration
  preserving existing component behavior. The updated frontend audit reports
  zero known vulnerabilities. CI/runtime and `.nvmrc` use Node 24.21.0. Advisory results are
  time-dependent and do not prove every dependency is safe.
- Local `.env` files, private-key formats and browser artifacts are ignored.
  The API lacked `.dockerignore`: remote build contexts could receive ignored
  local credentials even though the Dockerfile never copied them into the image.
  The new context exclusions prevent that transfer.

## Findings fixed

| Finding | Change and verification |
| --- | --- |
| Browser interceptor attached bearer credentials to every HttpClient destination and acted on unrelated 401s | Restrict both behaviors to the configured API origin and `/api` boundary; reject userinfo, malformed destinations and traversal. Foreign/scheme-relative/path-boundary regression tests cover the latent exposure. No current user-controlled exfiltration route was found. |
| Ordinary accounts could mutate shared market data through ingestion/job POSTs in production | Reusable guard returns 403 in production before handler/audit execution. Owned job reads and internal scheduled ingestion continue. Real HTTP regressions prove the boundary. |
| `Pick<CreateJobDto, ...>` bodies bypassed runtime DTO validation | Concrete ingestion DTOs reject object/invalid/oversized symbols, unknown fields and interval arrays beyond two unique supported values. |
| Production accepted unsupported database protocols while Prisma silently disabled persistence | Require a MySQL/MariaDB host and database at startup; readiness also fails closed if the persistence adapter is unavailable. |
| Public readiness responses exposed raw driver/upstream connection errors | Use bounded production error details, retaining useful dependency status and latency. Tests prove internal error strings are absent. |
| Case/accent-insensitive MySQL auth identifiers could conflate signed OAuth subjects | Add a new binary-collation migration for opaque auth identifiers and strict equality after database lookups. This hardens the identity boundary; no collision between actual Google/Apple subject formats was demonstrated. Unit and MySQL cases cover mutated subjects, state, tokens, handoffs and passkey IDs. |
| Abandoned auth state and client-rate-limit buckets could accumulate | Prune expired persisted OAuth states/challenges/handoffs on starts. Expire inactive IP buckets and cap active bucket storage without evicting/resetting active clients. |
| Reverse-proxy socket addresses could group unrelated clients into one auth limit | Explicit `TRUSTED_PROXY_CIDRS` accepts only IP/CIDR ingress allowlists; defaults to trusting no proxy and rejects blanket `/0` trust. Tests cover untrusted spoofing and ignoring earlier forged forwarded hops. Live ingress verification is still required. |
| No frontend framing/MIME/referrer headers | Vercel serves frame denial, nosniff, referrer policy and CSP restrictions on framing, base URLs and objects. Script/style CSP restrictions remain a compatibility follow-up; this policy makes no claim to prevent every XSS class. |

## Review of the new features

The OAuth review verified signed issuer/audience/algorithm/expiry/issued-at/subject
and nonce checks; one-use state and 60-second hashed verifier-bound handoffs;
explicit provider linking bound to the fresh original session; ownership and
concurrent redemption checks; secret-safe callback logging; fixed callback URLs;
and no email-only recovery bypass. All provider email collisions require an
existing authenticated account to link explicitly. Unsigned Apple callback email
cannot establish account ownership; unverified signed email is rejected.

User-owned strategy/backtest/trading access checks, parameterized database calls,
external-fetch targets, Angular rendering and profile update persistence were
also inspected. No additional cross-user access bypass, user-supplied outbound
URL, unsafe SQL interpolation or direct XSS sink was found in the reviewed paths.
P&L snapshots/reconciliation, UTC trade marker placement, pagination and chart
cleanup retain their existing regression coverage.

## Verification

- API: 98 suites / 910 tests; coverage gates pass (98.36% statements, 90.52% branches, 98.38% functions, 98.34% lines). Production build and lint pass.
- HTTP integration: 67 tests pass.
- Native signed-provider token smoke: 16 tests pass; the larger signed-token
  verifier matrix also runs inside the API suite.
- Web: Angular 22.2.1 with TypeScript 6.0.3 on Node 24.21.0 passes 20 files / 93 unit tests, lint and production build. The installed dependency tree has no invalid peers and the flagged registry-cache package is absent from the lockfile.
- Browser integration: 5 tests pass against real local API/web servers, with external providers mocked.
- Desktop and mobile profile save, shell update and reload also pass without overflow or page errors.
- [PR CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089380502)
  and [post-merge main CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089882994)
  pass, including all new migrations, backtest/P&L persistence, explicit recovery
  linking/restart/logout, concurrent AI quotas, case-sensitive auth identifiers,
  ownership checks on fresh MySQL and browser tests. The production API container
  build passed. Local Docker was unavailable during the final review, so CI
  supplied that database verification.
- Redacted history and working-tree scans pass after exact false-positive review.
  CI now repeats both scans with a pinned version and archive checksum, and runs
  the new auth recovery MySQL harness and browser integration suite.

## Before production

Production hosting is not provisioned. Repository and `production` environment
Actions secrets are empty as of October 2, 2026. The main-triggered deployment
workflow passed CI but failed at database migration; no live release was published.
See [deployment.md](./deployment.md) for provisioning and the current run evidence.

Apply both new migrations after checking for duplicate `(user_id, provider)`
identity rows. The binary migration preserves existing data and never modifies
previously deployed migration files. Configure provider credentials, exact HTTPS
API callbacks and the fixed SPA callback, then perform the real Google/Apple
signup/login/link/lost-device recovery smoke checklist in deployment.md.

Determine the actual ingress proxy CIDRs from the deployed network and verify
separate client limits and spoofed forwarded headers. Do not guess a broad Fly
private-network range. Auth limits and cached sessions remain process-local;
keep the documented single API replica or introduce shared coordination before
scaling. Protect the production deployment environment and use host secret
storage and the database provider's TLS configuration. Optional extra passkeys,
a stricter compatible script/style CSP and external infrastructure penetration
review remain follow-ups.

## References

- [Gitleaks usage and redaction](https://github.com/gitleaks/gitleaks/blob/master/README.md)
- [OWASP OAuth protections and transaction binding](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)
- [OpenID Connect case-sensitive subject identifiers](https://openid.net/specs/openid-connect-core-1_0.html#IDToken)
- [Express trusted proxy behavior](https://expressjs.com/en/guide/behind-proxies.html)
- [Registry cache advisory GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
