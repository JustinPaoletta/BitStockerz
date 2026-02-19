# BitStockerz – Security Model

## 1. Authentication
- Passkeys (WebAuthn) as primary authentication (no passwords stored)
- OAuth (Google + Apple) as secondary/fallback auth
- Session established after auth (secure cookie or bearer token)

## 2. Authorization
- Strict user-level tenancy enforced via user_id
- No cross-user data access allowed

## 3. Rate Limiting
- Login attempts rate-limited
- Backtest execution rate-limited per user

## 4. Secrets Management
- API keys stored in environment variables
- No secrets committed to repo

## 5. Transport Security
- HTTPS required in all non-local environments
