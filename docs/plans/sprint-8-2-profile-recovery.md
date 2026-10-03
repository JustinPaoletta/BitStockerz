# Sprint 8.2 — Profile and account recovery

- **Status:** Merged in [PR #13](https://github.com/JustinPaoletta/BitStockerz/pull/13) on October 2, 2026; CI verified, production provider setup/smoke outstanding.
- **Stories:** #1.2.1, #1.2.2, #1.1.6; authenticated extra passkeys are optional MVP+.
- **Original planning estimate (implementation now merged):** 2–3 engineering days for required scope; +1–2 days for extra passkeys.
- **Depends on:** Sprint 8.1 browser OAuth and authenticated provider linking.

## Outcome

Users can view/edit their profile and see their available sign-in methods. A user
who loses a passkey device can sign in through an already linked Google or Apple
identity and regain access to the same strategies, backtests, and paper portfolio.

## Baseline before Sprint 8.2

- `apps/api/src/auth/me.controller.ts` exposes authenticated `GET /api/me` and
  `PATCH /api/me`; `/api/auth/me` also returns the profile.
- `UpdateProfileDto` supports an optional display name up to 80 characters and
  only USD as base currency. Profile changes persist through the auth persistence
  service. Existing profile responses include linked-method information.
- Before this sprint, Angular's auth model covered basic identity fields without
  a Profile route or settings form.
- Story #1.1.6 defines minimum recovery as linked OAuth login and a lost-device
  hint. It does not require email magic links or manual account resets.

## Required implementation

### 1. Profile page

- Add authenticated `/profile` with an account/settings link from the shell.
- Load the full profile with `GET /api/me`; extend web models with the existing
  linked-provider flags and passkey count rather than inventing another API.
- Show email read-only, editable display name, and USD as the supported currency.
  Explain that display settings do not convert the USD paper ledger.
- Submit changed fields through `PATCH /api/me`, trim names consistently with the
  backend, validate the 80-character limit, and handle loading, success, and retry.
- Apply the saved profile to the shared auth signal so the shell updates
  immediately. Preserve edits on a failed save. Handle session expiry through
  the normal auth path.
- Test persistence after API restart and new login; keep the form usable at
  mobile widths and through keyboard navigation.

### 2. Recovery readiness and linking

- Show passkey count and linked Google/Apple methods using profile data.
- Offer configured, unlinked providers through Sprint 8.1's authenticated linking
  flow. Explain that a linked provider restores this existing account.
- Use the agreed Sprint 8.1 API contract. Linking requires a sign-in within five
  minutes; show a clear sign-in-again instruction when the session is older.
  Preserve the original account session on a cancelled, failed, or conflicting
  linking attempt. Re-fetch `/api/me` after success.
- Display a clear reminder when a user has a passkey but no recovery provider.
  Do not imply that entering an email address proves ownership.
- After linking, reload the profile and confirm the provider is attached to the
  same user id and paper account. Failed or conflicting links preserve the
  current session and existing methods.
- No unlink/delete-auth-method controls in this slice. If added later, prevent
  removal of the final usable sign-in method.

### 3. Lost-device path

- Add a login-page recovery link/hint: sign in with the Google or Apple account
  previously linked to BitStockerz. Show only configured provider actions.
- Include honest help for users with no linked alternative: the current MVP has
  no automatic recovery proof for them. Recommend configuring a recovery method
  while signed in, without adding an email-only bypass.
- Recovery reuses normal OAuth subject mapping and session creation; it must
  never create another user/account for a previously linked identity.
- Success returns to the requested application page. Test user id, original
  strategy/backtest ownership, paper-account id/cash, and session persistence.

## Optional extension — another passkey

This is separate from the required #1.1.6 scope and can follow immediately if
prelaunch time permits.

This implementation delivers the required OAuth recovery scope first. Extra
passkeys remain explicitly optional and are not part of the current completion
claim. No email reset, manual ownership bypass, or destructive method removal is
included.

- Add authenticated `POST /api/auth/webauthn/credentials/options` and `/verify`.
  Bind each challenge to the signed-in user and purpose, require recent identity
  verification, expire and consume it once, and exclude existing credentials.
- Add a credential to the existing user. Do not reuse the signup ceremony that
  derives account ownership from a supplied email address.
- Record a friendly label/created date if credential management is exposed; use
  an additive migration for challenge ownership/purpose and optional metadata.
- Show “Add another passkey” after OAuth recovery. Handle cancelled prompts and
  duplicate credentials without changing the account or revoking current access.
- Test wrong-user challenges, duplicate/replayed/expired verification, cancelled
  prompts, browser support, restart persistence, and login with the added passkey.

## Delivery order and verification

1. Extend web profile models/service and shared auth profile updates.
2. Build profile page and shell navigation using existing API contracts.
3. Wire authenticated OAuth linking, recovery readiness, and login help.
4. Add focused API/web regression tests and MySQL restart verification.
5. Browser smoke: edit/save/reload, link a provider, log out, simulate loss of the
   passkey device, recover via linked OAuth, and verify original account data.
6. Document the available recovery methods and update stories, roadmap, manual
   testing, and deployment checks. Run API/web build/lint/unit plus coverage/e2e.

Required scope is complete when profile edits persist and linked-provider
recovery demonstrably returns a user to their original data in production.
Production OAuth credentials/URLs remain external prerequisites for that final
smoke. Optional extra passkeys must be tracked separately if left for later.

The earlier 1–3 day estimates described the UI slices. The reviewed combined
planning estimate was 5–8 engineering days including secure browser handoff,
linking persistence and recovery regressions, excluding external provider setup.
Implementation and local verification are now complete; that estimate is no
longer remaining development work.

## Merged delivery evidence — October 2, 2026

- PR #13 merged; [post-merge main CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37089882994) passes.
- API: 98 suites / 910 unit tests, 67 HTTP tests and 16 native signed-token smoke
  tests. Coverage gates pass (98.36% statements, 90.52% branches, 98.38% functions,
  98.34% lines). The larger signed-token verifier matrix is included in unit tests.
- Web: 93 unit tests and five browser tests, including mocked-provider callbacks,
  profile persistence and failed-link session retention. File isolation prevents
  test module mocks from depending on load order.
- Fresh MySQL CI applies all migrations and verifies state/handoff persistence,
  original-session linking, wrong-verifier/replay protection, cross-instance
  one-use redemption, stable original account/data, conflicts, case-sensitive
  opaque identifiers, expiry cleanup and original sign-in age.
- API/web build and lint, dependency audits and redacted secret scans pass.
  Desktop/mobile save/reload visual checks also passed locally.
- Real provider credentials, HTTPS callback registration and each enabled
  provider's production smoke remain required release checks. No production
  hosting is provisioned; optional extra passkeys remain deferred.
