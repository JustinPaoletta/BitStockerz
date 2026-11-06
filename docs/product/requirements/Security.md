# BitStockerz – Security Model

## 1. Authentication

- Passkeys (WebAuthn) as primary authentication (no passwords stored)
- Browser OAuth (Google + Apple) as optional secondary/recovery authentication; native providers remain disabled
- Session established after auth as a bearer token (`Authorization: Bearer …`)
- Without `DATABASE_URL`, users, sessions, and passkey credentials remain
  in-memory only. With MySQL enabled, auth users, sessions, passkeys, OAuth
  identities, and ceremony state persist and hydrate on startup so user ids
  stay stable across API restarts.
- Development email register/login shortcuts are gated by
  `AUTH_DEV_EMAIL_ENABLED` (default `true` outside production; must be `false`
  in production). The Angular **Development email sign-in** panel is shown only in
  non-production builds. Passkey register/sign-in is the primary auth UI.
  Google/Apple browser login, explicit recovery-provider linking and Profile
  settings merged in PR #13 (Sprints 8.1–8.2). Real provider credentials, HTTPS
  callbacks and production smoke checks remain outstanding.
- Browser OAuth handoffs are short-lived, one-use and verifier-bound. Provider
  email matches never attach a new identity to an existing account; linking
  requires the original authenticated session and a sign-in within five minutes.
  Email knowledge alone cannot recover an account.

### Native authentication and test modes

The [iOS app](../../../IOS_PROTOTYPE.md) uses AuthenticationServices for passkeys and keeps bearer tokens in memory.
Relaunch requires sign-in. Native Google/Apple OAuth is not enabled.

The Personal Team `device-demo` mode uses fictional test login and synthetic data; it does not verify identity or native passkeys.
Passkey-only `device` mode requires an associated HTTPS domain. Its isolated API disables email login and legacy WebAuthn bypasses.
That prototype API accepts `capacitor://localhost` for CORS and validates the HTTPS relying-party origin for WebAuthn.

Staging and production require separate origin, domain-association, and physical-device acceptance.
Never include the production proxy key or hosting credentials in the app.

### Persistent mobile admission

Stage B of the [app delivery plan](../../../APP_ONLY_PLAN.md) is implemented behind `PRIVATE_BETA_MOBILE_ENABLED=false`.
Enabling mobile admission requires private-beta protection, persistent MySQL, and disabled development email and legacy WebAuthn bypasses.
Passkey enrollment requires a valid, expiring invitation for the intended email.
The database stores its hash, intended identity, expiry, and redemption state. The raw code is not persisted.
The server binds the invitation hash to the registration challenge.

Successful verification atomically redeems the invitation and creates the user, credential, admission, and session.
Cancellation does not redeem an invitation. Failed verification requires a new challenge before retrying.
Returning passkey login requires an admitted user.

Direct clients can access only four rate-limited passkey bootstrap routes before authentication.
An explicit route policy requires current database admission and session validity for protected user requests, including requests through the retained proxy.
Route classification follows Express's case-insensitive paths and `HEAD` dispatch through the corresponding `GET` policy.
Operator routes remain outside direct mobile access. Existing tenant ownership checks and authentication rate limits remain active.

The legacy proxy key remains configured for other protected routes. Never disable the guard or compile that key into the app.
See [mobile beta operations](../../ops/mobile-beta.md) for invitations, revocation, and the activation contract.

Local tests verify invitation races, rollback, restart hydration, and revocation. Hosted staging and real native passkeys remain unverified.
Distribution through TestFlight, an app identifier, and CORS do not authorize a caller.
The first beta retains memory-only native bearer storage; persistent Keychain sessions require a separate lifecycle design.

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
