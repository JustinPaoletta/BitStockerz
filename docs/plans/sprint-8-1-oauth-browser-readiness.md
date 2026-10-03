# Sprint 8.1 — Google and Apple browser login

**Status:** Implemented and verified locally October 2, 2026; production provider setup/smoke pending.
**Stories:** #1.1.3, #1.1.4; prerequisite for #1.1.6 recovery.
**Estimate:** 3–5 engineering days, plus provider account/domain setup.
**Depends on:** Existing auth persistence, passkey UI, production API/web origins.

## Outcome

Users can choose Google or Apple on the Angular login page, complete the provider
flow, and return to their intended page with a valid BitStockerz session. Returning
users retain their strategies and paper account. Configured providers are available
in account settings as recovery methods.

## Baseline before Sprint 8.1 (gaps resolved by this implementation)

- `apps/api/src/auth/auth.controller.ts` has Google/Apple start and callback routes,
  including Apple's form-post callback. These previously returned only JSON.
- `auth.service.ts` exchanges provider codes, validates JWTs, links subjects, and
  creates bearer sessions. The OAuth state and nonce persist in MySQL.
- `auth-persistence.service.ts` persists users, identities, and sessions.
- Angular `core/auth/auth.service.ts` handles bearer sessions and passkeys but has
  no OAuth redirect/callback flow. `/login` has no production provider buttons.
- Before this sprint, token verification permitted a missing nonce, Google
  email linking did not require a verified email claim, and Apple callback form
  fields could become linking inputs. This implementation closes those gaps.

## Adopted implementation

### 1. Provider availability and login buttons

- Add public `GET /api/auth/providers` returning only `{ google: boolean,
  apple: boolean }`, based on complete provider configuration. Never expose secrets.
- Angular shows configured providers, disables actions while starting a flow, and
  displays cancellation/failure copy. Passkeys remain the primary option.
- Keep development provider shortcuts disabled in production.

### 2. Browser flow and session handoff

Retain the existing JSON routes for API compatibility. Add a browser mode to
start/callback routes, identified by the stored OAuth state rather than an
untrusted callback flag.

1. The SPA generates a random session-exchange verifier and stores it in
   `sessionStorage`, scoped to this flow. Send its SHA-256 challenge and a local
   return path when starting OAuth.
2. Store provider, nonce, challenge, validated return path, expiry, and flow mode
   with OAuth state. For linking, also bind the authenticated user id.
3. Navigate to the provider's authorization URL. Use the existing server-side code
   exchange; secrets stay on the API.
4. The API validates and consumes the state and provider response. Browser mode
   creates a short-lived session handoff for the verified user, then redirects to
   the configured SPA `/auth/oauth/callback` with a **one-use code** in the fragment.
   A bearer token must never appear in a redirect URL.
5. The SPA immediately removes the fragment with `history.replaceState`, then
   posts `{ code, verifier }` to `POST /api/auth/oauth/session/exchange`.
6. The API checks expiry and the verifier challenge, consumes the handoff atomically,
   and creates the normal bearer session. Angular applies it through the existing
   session logic, fetches `/api/auth/me`, and follows the saved local return path.

Use a cryptographically random code (at least 256 bits); persist only its hash,
user id, verifier challenge, expiry, and return path. Adopt a 60-second handoff
TTL. The verifier binds redemption to the initiating browser, including when the
API and SPA are hosted on different origins. Do not depend on third-party cookies.
Clear browser flow state after success or failure. No secrets/codes/tokens in logs.

Reject absent, expired, replayed, wrong-provider, or wrong-verifier state/handoffs.
Allow only local application return paths; callback destinations come from a
validated deployment setting. Failures redirect using bounded error identifiers,
without provider error text or identity data in URLs. Handle Apple's
`application/x-www-form-urlencoded` POST and Google GET callbacks.

### 3. Identity and linking rules

- Require exact nonce equality, issuer, audience, signature, expiry, and a stable
  subject for each configured provider. Include missing-claim tests.
- Existing provider subjects always resolve to their recorded user first.
- Never automatically attach a new provider subject to an existing user by email.
  An email collision requires signing into the existing account and explicitly
  linking the provider. Existing subjects always recover their original user,
  even if the provider email changes. New-user email must come from verified,
  signed claims; unsigned callback fields never prove ownership.
- Treat Apple's form `user` object only as optional display metadata. Preserve
  the stable subject when email is omitted on later logins. Test private relay
  addresses and a later login with no email.
- Add authenticated `POST /api/auth/oauth/:provider/link/start` with the same
  verifier challenge. Bind the flow to its initiating user. Require recent identity
  verification before adding a recovery method. Persist each session's original
  sign-in time and allow linking only within five minutes of a fresh sign-in;
  hydration/refresh must not extend that window. Bind linking state and handoff
  to the initiating session and user. Defer attaching the identity until the
  original browser redeems the handoff with its verifier and that same valid
  session, so the callback alone cannot change recovery methods.
- Identity uniqueness/conflicts fail closed. New users get exactly one paper
  account, including racing callbacks. A linking flow never provisions a second user.

## Agreed API and browser contract

- `GET /api/auth/providers` returns `{ google: boolean, apple: boolean }`.
- `POST /api/auth/oauth/:provider/browser/start` and authenticated
  `POST /api/auth/oauth/:provider/link/start` accept
  `{ code_challenge: string, return_path: string }` and return the existing
  `OAuthStartResponse` shape. Challenge is the base64url SHA-256 hash of a
  cryptographically random 32-byte browser verifier. Only configured providers
  are enabled in the browser; existing development JSON routes remain separate.
- Existing Google GET and Apple GET/form-POST callbacks select their behavior
  from persisted state. Browser responses redirect to the fixed
  `AUTH_OAUTH_BROWSER_CALLBACK_URL` with fragment `code` and `state`, or a bounded
  `error` and `state`. `state` must match the SPA's saved flow. No bearer token is
  emitted by a browser callback. Apple `sub` is optional callback input because
  production identity comes from the signed token, not the form.
- `POST /api/auth/oauth/session/exchange` accepts `{ code, verifier }`, validates
  expiry and challenge before atomic consumption, and returns `AuthResponse`
  plus `{ return_path: string, intent: 'login' | 'link' }`. Link redemption also
  requires the initiating bearer session. A failed link leaves it intact.
- SPA flow state is scoped to `sessionStorage`, cleared on success/failure, and
  expires with server state. Scrub the callback fragment before HTTP requests.
  Reject external/network-path/backslash/control-character return destinations.
- Record verified provider metadata in the handoff for pending links; persist
  only the handoff-code hash. Apply identity uniqueness before mutating memory.
  Failed provisioning/linking must not leave an extra user or orphaned identity.
- Auth request logging must redact provider codes/state/user fields, exchange
  verifiers, callback query strings and redirect Location values, in addition to
  bearer tokens. Add regression tests for logged HTTP callback requests.

## Files and persistence

API: auth controller/service, DTOs, configuration, rate limiting, persistence,
OpenAPI schemas, and an additive Prisma migration for browser state metadata and
hashed session handoffs. Introduce small helpers for redirect validation and
handoff redemption so they can be tested independently.

Web: auth service/models, login page, an unguarded callback page, app routes, and
account-provider linking hooks used by Sprint 8.2. The callback must work without
an existing session and through a direct/deep-link navigation.

Update story acceptance criteria, API inventory, `.env.example`, production
runbook, manual testing, and the roadmap when implemented.

## External setup

- Google: OAuth web client, consent/branding configuration, allowed users as
  applicable, exact API callback URL, client id and secret.
- Apple: Sign in with Apple app/service identifiers, website domains/return URLs,
  team id, key id, signing private key, and the configured client id.
- Record final SPA/API HTTPS origins and callback destinations. Keep provider
  credentials in host/CI secrets. Apple key/account requirements can add calendar
  time independently of implementation.

## Verification and completion criteria

- Unit/HTTP tests: availability flags; nonce and email-claim enforcement; redirect
  validation; signed-in linking/conflicts; denial; malformed Apple form; expired
  state; one-use handoff; wrong verifier; rate limits; account provisioning races.
- MySQL checks: state/handoff consumption is atomic and survives API restarts;
  subject links and sessions retain the same user and paper account.
- Browser tests: successful return to protected deep links, cancellation, retry,
  expired handoff, callback refresh, and keyboard/mobile behavior. Mock external
  providers for repeatable CI; keep real-provider production smoke separate.
- Production smoke with each real provider: new signup, returning sign-in,
  existing-user linking, Apple relay/second login, and original portfolio intact.
- Build/lint/unit/coverage/e2e gates pass; neither session tokens nor provider
  secrets appear in URLs, browser assets, logs, or test artifacts.

## References

- [Google OpenID Connect server flow and identity claims](https://developers.google.com/identity/openid-connect/openid-connect)
- [Apple environment configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple)
- Repository story contract: `docs/product/stories/BitStockerz_MVP_01_User_Account_Stories.md`.

The session-handoff design above is a project implementation decision layered on
the providers' authorization-code flows.

## Local delivery evidence — October 2, 2026

- API: 94 unit suites / 846 tests, 67 HTTP e2e tests; coverage gates passed
  (98.35% statements, 90.42% branches, 98.37% functions, 98.32% lines).
- Web: 66 unit tests and five browser e2e tests, including Google/Apple mocked
  callbacks, profile persistence, mobile forms and failed-link session retention.
- Real locally signed JWT regression: 29 production-verifier checks for both
  providers, invalid signatures/claims/nonce/expiry/algorithms; no provider network.
- MySQL migration preflight and deploy passed locally. Auth smoke verifies state
  and handoff restart persistence, exact-session linking, wrong-verifier/replay
  protection, cross-instance one-use redemption, stable original account/cash/
  strategy/backtest ownership, conflict rejection and original sign-in age.
- API/web builds and full lint passed. Desktop/mobile save/reload visual checks
  passed. Changes remain local and uncommitted; no PR or deployment is implied.
- Real provider credentials, HTTPS callback registration and each enabled
  provider's production smoke remain required release checks. Optional extra
  passkeys remain deferred.
