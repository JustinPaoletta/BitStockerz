# Mobile beta admission

Updated November 4, 2026. This contract implements Stage B of [the app delivery plan](../../APP_ONLY_PLAN.md).
It does not activate a hosted service. Keep production deployment disabled until the release gates pass.

## Access contract

`PRIVATE_BETA_MOBILE_ENABLED` defaults to `false`. Existing behavior remains unchanged with this flag disabled.
Enabling it requires `PRIVATE_BETA_ENABLED=true`, persistent MySQL, and both development authentication bypasses disabled.
Set `AUTH_DEV_EMAIL_ENABLED=false` and `AUTH_LEGACY_WEBAUTHN_ENABLED=false`.
Apply all pending migrations before starting an API with mobile admission enabled.

Keep the existing server-only proxy key configured. Never put that key in the app.
The legacy proxy lane remains available. Mobile admission does not replace its protection for operator and unsupported routes yet.
With mobile admission enabled, allowlisted user routes check current admission and session state even through the legacy proxy.

With mobile admission enabled, passkey enrollment requires an invitation and returning passkey sign-ins require an admitted user.
Legacy browser OAuth remains separate; a session from that lane still needs admission to access allowlisted user routes.
Use the native registration form for invitation enrollment; the legacy browser form does not collect invitation codes.

## Existing-account limitation

The current path enrolls new invited accounts. It does not admit existing accounts automatically.
Registration rejects an email already attached to an account.
The operator tool has no command to grant admission to an existing user or reactivate revoked admission.
Applying the migration alone does not create admission records.

Before enabling mobile access for valued existing accounts, establish an approved migration and recovery procedure.
Keep this work pending until that procedure is implemented and tested.
Do not delete or recreate accounts to work around missing admission.

## Direct mobile routes

Direct clients can access only the four rate-limited passkey enrollment/login bootstrap routes before authentication.
All other mobile routes require an unexpired database session and an active admission record.
Route classification follows Express: paths ignore case, and `HEAD` requests use the corresponding `GET` access policy.
The explicit allowlist preserves existing account ownership checks and excludes operator jobs, ingestion, metrics, and unsupported authentication routes.

Health probes and separately keyed market-data monitoring keep their existing access rules.
AI routes retain their existing server feature controls. This change does not activate live AI.

## Invitations and enrollment

An invitation contains 32 random bytes encoded as a 43-character base64url token.
The database stores its SHA-256 hash, intended email, expiry, revocation, and redemption state.
The operator chooses the intended identity; possession of an email address does not authorize enrollment.

The client sends `invitation_token` in the registration-options request body.
The server validates it and binds its hash to a persisted passkey challenge.
The verification request uses the challenge ID and passkey attestation. It does not resubmit the invitation token.
The server retains its existing RP, origin, challenge, and user-verification checks.

Successful verification atomically redeems the invitation and creates the user, credential, admission, and session.
Concurrent verification can commit only one enrollment. A failed transaction leaves no partially enrolled account.
Cancelling passkey creation does not redeem the invitation. Failed verification requires a new challenge before retrying.

The app keeps the code in form memory for retry and clears it after success or switching to sign-in.
Invitation codes do not belong in URLs, browser storage, logs, or committed configuration.

## Operator commands

Run commands from the repository root with dependencies installed and migrations applied.
Supply `DATABASE_URL` through the operator environment.
For remote databases, set `DATABASE_CA_CERT_PATH` to the approved PEM certificate. The tool requires verified TLS.
Use a protected path outside the repository for raw invitation files. Do not place them in backups or shared folders accidentally.

Create an invitation valid for 24 hours:

```sh
node apps/api/tools/mobile-admission.mjs create \
  --email OWNER_EMAIL \
  --hours 24 \
  --output /ABSOLUTE/PRIVATE/PATH/bitstockerz-invitation.json
```

Replace `OWNER_EMAIL` with the intended account email. Choose an existing private directory for the output file.
The command creates a new file with mode `0600` and refuses to overwrite an existing file or symlink.
It prints only the invitation hash, expiry, and save status. Read the token privately when entering it in the app.

Deliver the code securely if inviting another tester. Remove the raw file when it is no longer needed.

Check or revoke an admitted user:

```sh
node apps/api/tools/mobile-admission.mjs status --user-id USER_UUID
node apps/api/tools/mobile-admission.mjs revoke --user-id USER_UUID
```

Revocation records the suspension and removes the user's database sessions in one transaction.
Allowlisted user requests check current database state, including requests through the proxy. Cached API sessions cannot bypass that revocation.

Revoke an unused invitation using the hash returned during creation:

```sh
node apps/api/tools/mobile-admission.mjs revoke-invitation --hash INVITATION_SHA256
```

Account deletion removes admission and related invitation identity records through the existing deletion transaction.
Backup retention and external deletion records still require the operational acceptance described in the main plan.
Recovery must also invalidate outstanding restored invitations and reconcile admission revocations made after the backup.
The external admission-revocation record and recovery workflow are not implemented.

## Acceptance gates

Run the API unit suite, HTTP end-to-end suite, operator-tool tests, and MySQL mobile admission regression.
The CI database job invokes `npm run test:mysql:mobile-admission` from `apps/api` after migrations.
Use a disposable local database for development; these tests must not run against production.

Before activation, verify the complete path against hosted staging:

- Invited passkey enrollment and returning login using the real associated domain and signing team.
- Missing, expired, revoked, identity-mismatched, replayed, and concurrently submitted invitations.
- Failed and cancelled ceremonies, including retry with a new challenge.
- Admission and session revocation, database failure, API restart, and cross-user access rejection.
- Exact native origins, ingress trust, authentication rate limits, and private operator endpoints.
- Chart, strategy, backtest, paper-account, export, security, and deletion journeys on the signed phone build.

Record local automated evidence separately from hosted and physical-device results.
Split API deployment from Vercel only after the replacement access path passes its staging gates.
