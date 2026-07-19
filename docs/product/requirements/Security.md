# BitStockerz – Security Model

## 1. Authentication
- Passkeys (WebAuthn) as primary authentication (no passwords stored)
- OAuth (Google + Apple) as secondary/fallback auth
- Session established after auth as a bearer token (`Authorization: Bearer …`)
- Current API keeps users, sessions, and passkey credentials in memory; MySQL only gets a minimal `users` row when jobs need a foreign key

## 2. Authorization
- Strict user-level tenancy enforced via user_id
- No cross-user data access allowed

## 3. Rate Limiting
- WebAuthn options/verify and OAuth start endpoints are rate-limited (`AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX_REQUESTS`; defaults 60s / 30 requests). Dev shortcuts `POST /auth/register` and `POST /auth/login` are not rate-limited today.
- Backtest execution rate-limited per user (planned with backtesting)

## 4. Secrets Management
- API keys stored in environment variables
- No secrets committed to repo

## 5. Transport Security
- HTTPS required in all non-local environments
