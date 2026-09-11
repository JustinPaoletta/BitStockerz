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
  Google/Apple OAuth browser polish and deployed redirect hosting remain
  Sprint 7.2.

## 2. Authorization
- Strict user-level tenancy enforced via user_id
- No cross-user data access allowed

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
- No secrets committed to repo
- Production boot validation requires `DATABASE_URL`, exact CORS/WebAuthn
  origins, `AUTH_DEV_EMAIL_ENABLED=false`, `AUTH_LEGACY_WEBAUTHN_ENABLED=false`,
  `ERROR_TEST_ENABLED=false`, and rejects unsafe OpenAPI exposure unless
  explicitly enabled. OAuth provider settings are accepted only as complete
  provider-specific sets.

## 5. Transport Security
- HTTPS required in all non-local environments
