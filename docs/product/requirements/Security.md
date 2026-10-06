# BitStockerz – Security Model

## 1. Authentication

- Passkeys (WebAuthn) as primary authentication (no passwords stored)
- OAuth (Google + Apple) as secondary/fallback auth
- Session established after auth as a bearer token (`Authorization: Bearer …`)
- Without `DATABASE_URL`, users, sessions, and passkey credentials remain
  in-memory only. With MySQL enabled, auth users, sessions, passkeys, OAuth
  identities, and ceremony state persist and hydrate on startup so user ids
  stay stable across API restarts.
- Development email register/login shortcuts are gated by
  `AUTH_DEV_EMAIL_ENABLED` (default `true` outside production; must be `false`
  in production). The Angular **Email fallback** panel is shown only in
  non-production builds. Passkey register/sign-in is the primary auth UI.
  Google/Apple browser login, explicit recovery-provider linking and Profile
  settings merged in PR #13 (Sprints 8.1–8.2). Real provider credentials, HTTPS
  callbacks and production smoke checks remain outstanding.
- Browser OAuth handoffs are short-lived, one-use and verifier-bound. Provider
  email matches never attach a new identity to an existing account; linking
  requires the original authenticated session and a sign-in within five minutes.
  Email knowledge alone cannot recover an account.

## 2. Authorization

- Strict user-level tenancy enforced via user_id
- No cross-user data access allowed
- Manual ingestion/job POSTs are development/test tools and return 403 in
  production; only internal scheduling can update shared market data there.

## 3. Rate Limiting

- WebAuthn options/verify, OAuth start/callback paths, and dev email
  `POST /api/auth/register` / `POST /api/auth/login` are rate-limited
  (`AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX_REQUESTS`; defaults 60s /
  30 requests).
- `POST /api/backtests` is rate-limited per authenticated user
  (`BACKTEST_RATE_LIMIT_WINDOW_MS` / `BACKTEST_RATE_LIMIT_MAX_REQUESTS`;
  defaults 60s / 10 requests). Backtest list/detail reads are not rate-limited
  by this guard.

## 4. Secrets Management

- API keys stored in environment variables
- Do not commit secrets to the repository.
- Production boot validation requires `DATABASE_URL`, exact CORS/WebAuthn
  origins, `AUTH_DEV_EMAIL_ENABLED=false`, `AUTH_LEGACY_WEBAUTHN_ENABLED=false`,
  and `ERROR_TEST_ENABLED=false`.
  OpenAPI defaults false in production; explicit `OPENAPI_ENABLED=true` is accepted.
  Keep public OpenAPI disabled for launch. OAuth provider settings are accepted only as complete
  provider-specific sets.
- Production persistence must be MySQL/MariaDB and readiness fails closed without
  an active adapter; public production health details exclude raw driver errors.
- CI scans reachable history and the working tree for secrets and runs dependency
  audits. Review results are time-dependent; see [security-review.md](../../ops/security-review.md).

## 5. Transport Security

- HTTPS required in all non-local environments
- Frontend bearer headers are restricted to the configured API origin and path.
- `TRUSTED_PROXY_CIDRS` defaults to no proxy trust; configure actual ingress CIDRs
  and verify client-IP isolation before launch. Auth/session caches and rate limits
  are process-local, so keep a single API replica until shared coordination exists.
