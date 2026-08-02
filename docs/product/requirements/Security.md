# BitStockerz – Security Model

## 1. Authentication
- Passkeys (WebAuthn) as primary authentication (no passwords stored)
- OAuth (Google + Apple) as secondary/fallback auth
- Session established after auth as a bearer token (`Authorization: Bearer …`)
- Current API keeps users, sessions, and passkey credentials in memory. MySQL
  receives a minimal `users` row when persisted jobs, strategies, or backtests
  need ownership foreign keys; same-email re-registration remaps those owned
  rows after an API restart.
- Development email register/login shortcuts are intentionally exposed by the
  current thin Angular shell. Production authentication hardening and removal
  or restriction of those shortcuts remains Sprint 5.1 work.

## 2. Authorization
- Strict user-level tenancy enforced via user_id
- No cross-user data access allowed

## 3. Rate Limiting
- WebAuthn options/verify and OAuth start endpoints are rate-limited
  (`AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX_REQUESTS`; defaults 60s /
  30 requests). Dev shortcuts `POST /api/auth/register` and
  `POST /api/auth/login` are not rate-limited today.
- `POST /api/backtests` is rate-limited per authenticated user
  (`BACKTEST_RATE_LIMIT_WINDOW_MS` / `BACKTEST_RATE_LIMIT_MAX_REQUESTS`;
  defaults 60s / 10 requests). Backtest list/detail reads are not rate-limited
  by this guard.

## 4. Secrets Management
- API keys stored in environment variables
- No secrets committed to repo
- Production WebAuthn requires explicit `WEBAUTHN_ALLOWED_ORIGINS`; OAuth
  provider settings are accepted only as complete provider-specific sets.

## 5. Transport Security
- HTTPS required in all non-local environments
