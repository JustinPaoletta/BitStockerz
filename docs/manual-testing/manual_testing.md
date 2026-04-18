# Sprint 0.2 Manual Testing Guide (Auth, Profile, Sessions, OAuth, Rate Limits)

This guide covers manual verification for Sprint 0.2 roadmap stories in chronological order:

- #1.1.1 User can create an account with a passkey
- #1.1.2 User can sign in with a passkey
- #1.1.3 User can connect/sign in with Google OAuth
- #1.1.4 User can connect/sign in with Apple OAuth
- #1.1.5 User can manage sessions (logout/token expiry)
- #1.1.6 Account recovery/lost-device path (MVP minimum)
- #1.2.1 User can view basic profile
- #1.2.2 User can update display preferences
- #1.4.1 Rate limit auth endpoints

Date authored: 2026-02-20

## Scope Notes

- This backend currently supports two practical test modes:
  - Local fallback mode (no provider credentials, no external RP domain): fully testable via `curl` + optional browser.
  - Real verification mode (Google/Apple token exchange + cryptographic WebAuthn): testable once provider credentials are available.
- Account data is in-memory in this service. Restarting the API resets test users/sessions/challenges.

## Prerequisites

1. Node `24.11.1` and npm installed.
2. A terminal with `curl`. `jq` is strongly recommended for command snippets.
3. For cryptographic WebAuthn checks, use Chrome/Safari on `localhost`.

## Start API

```bash
cd /Users/justinpaoletta/Desktop/PROJECTS/APPS/BitStockerz/apps/api
npm install
npm run start:dev
```

API base URL for this guide:

```bash
export BASE_URL="http://localhost:3000/api"
```

## Shared Test Variables

```bash
export PASSKEY_EMAIL="passkey.manual@example.com"
export OAUTH_EMAIL="oauth.manual@example.com"
export RECOVERY_EMAIL="recovery.manual@example.com"
```

## Step 1 - #1.1.1 Passkey Registration

### 1A. API fallback registration smoke test (works now without WebAuthn browser payload)

1. Create registration options:

```bash
REG_OPTIONS_JSON=$(curl -sS -X POST "$BASE_URL/auth/webauthn/register/options" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PASSKEY_EMAIL\"}")

echo "$REG_OPTIONS_JSON" | jq
export REG_CHALLENGE_ID=$(echo "$REG_OPTIONS_JSON" | jq -r '.challenge_id')
export REG_CHALLENGE=$(echo "$REG_OPTIONS_JSON" | jq -r '.challenge')
```

Expected:
- HTTP `201`
- `challenge_id` and `challenge` present.
- `rp_id` present (default `localhost` unless overridden).

2. Verify registration using fallback payload:

```bash
REGISTER_VERIFY_JSON=$(curl -sS -X POST "$BASE_URL/auth/webauthn/register/verify" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\":\"$PASSKEY_EMAIL\",
    \"challenge_id\":\"$REG_CHALLENGE_ID\",
    \"challenge\":\"$REG_CHALLENGE\",
    \"credential_id\":\"manual-cred-1\",
    \"public_key\":\"manual-public-key-1\",
    \"sign_count\":1,
    \"transports\":[\"internal\"]
  }")

echo "$REGISTER_VERIFY_JSON" | jq
export PASSKEY_TOKEN=$(echo "$REGISTER_VERIFY_JSON" | jq -r '.access_token')
export PASSKEY_USER_ID=$(echo "$REGISTER_VERIFY_JSON" | jq -r '.user.id')
```

Expected:
- HTTP `201`
- `token_type: "Bearer"`
- `user.email == $PASSKEY_EMAIL`
- `user.linked_auth_methods.passkeys == true`

### 1B. Cryptographic WebAuthn registration (real attestation/assertion payload)

Use this after loading `http://localhost:3000` in a browser.

Open browser devtools console and run:

```js
const baseUrl = 'http://localhost:3000/api';
const email = 'passkey.crypto@example.com';

const b64urlToBuf = (value) => {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
};

const bufToB64url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const register = async () => {
  const optionsRes = await fetch(`${baseUrl}/auth/webauthn/register/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const optionsJson = await optionsRes.json();

  const publicKey = structuredClone(optionsJson.options);
  publicKey.challenge = b64urlToBuf(publicKey.challenge);
  publicKey.user.id = b64urlToBuf(publicKey.user.id);
  if (publicKey.excludeCredentials) {
    publicKey.excludeCredentials = publicKey.excludeCredentials.map((c) => ({
      ...c,
      id: b64urlToBuf(c.id),
    }));
  }

  const credential = await navigator.credentials.create({ publicKey });
  const response = {
    id: credential.id,
    rawId: bufToB64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      attestationObject: bufToB64url(credential.response.attestationObject),
      clientDataJSON: bufToB64url(credential.response.clientDataJSON),
      transports: credential.response.getTransports?.(),
    },
  };

  const verifyRes = await fetch(`${baseUrl}/auth/webauthn/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      challenge_id: optionsJson.challenge_id,
      response,
    }),
  });

  return await verifyRes.json();
};

register();
```

Expected:
- Browser passkey prompt appears.
- Verify endpoint returns HTTP `201` with bearer token and linked passkeys set to `true`.

## Step 2 - #1.1.2 Passkey Login

### 2A. API fallback login flow

1. Request login options:

```bash
LOGIN_OPTIONS_JSON=$(curl -sS -X POST "$BASE_URL/auth/webauthn/login/options" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PASSKEY_EMAIL\"}")

echo "$LOGIN_OPTIONS_JSON" | jq
export LOGIN_CHALLENGE_ID=$(echo "$LOGIN_OPTIONS_JSON" | jq -r '.challenge_id')
export LOGIN_CHALLENGE=$(echo "$LOGIN_OPTIONS_JSON" | jq -r '.challenge')
```

Expected:
- HTTP `201`
- `allow_credentials` includes `manual-cred-1`.

2. Verify login (counter must advance):

```bash
LOGIN_VERIFY_JSON=$(curl -sS -X POST "$BASE_URL/auth/webauthn/login/verify" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\":\"$PASSKEY_EMAIL\",
    \"challenge_id\":\"$LOGIN_CHALLENGE_ID\",
    \"challenge\":\"$LOGIN_CHALLENGE\",
    \"credential_id\":\"manual-cred-1\",
    \"sign_count\":2
  }")

echo "$LOGIN_VERIFY_JSON" | jq
export LOGIN_TOKEN=$(echo "$LOGIN_VERIFY_JSON" | jq -r '.access_token')
```

Expected:
- HTTP `201`
- bearer token returned.

### 2B. Negative check: sign counter replay should fail

```bash
LOGIN_OPTIONS_REPLAY_JSON=$(curl -sS -X POST "$BASE_URL/auth/webauthn/login/options" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PASSKEY_EMAIL\"}")

LOGIN_REPLAY_CHALLENGE_ID=$(echo "$LOGIN_OPTIONS_REPLAY_JSON" | jq -r '.challenge_id')
LOGIN_REPLAY_CHALLENGE=$(echo "$LOGIN_OPTIONS_REPLAY_JSON" | jq -r '.challenge')

curl -i -X POST "$BASE_URL/auth/webauthn/login/verify" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\":\"$PASSKEY_EMAIL\",
    \"challenge_id\":\"$LOGIN_REPLAY_CHALLENGE_ID\",
    \"challenge\":\"$LOGIN_REPLAY_CHALLENGE\",
    \"credential_id\":\"manual-cred-1\",
    \"sign_count\":2
  }"
```

Expected:
- HTTP `401`
- `code: "UNAUTHORIZED"`

## Step 3 - #1.1.3 Google OAuth

### 3A. Local fallback mode (no Google credentials configured)

1. Start OAuth:

```bash
GOOGLE_START_JSON=$(curl -sS "$BASE_URL/auth/oauth/google/start")
echo "$GOOGLE_START_JSON" | jq
export GOOGLE_STATE=$(echo "$GOOGLE_START_JSON" | jq -r '.state')
```

2. Callback with fallback identity:

```bash
GOOGLE_CALLBACK_JSON=$(curl -sS -G "$BASE_URL/auth/oauth/google/callback" \
  --data-urlencode "state=$GOOGLE_STATE" \
  --data-urlencode "code=google-manual-code-1" \
  --data-urlencode "email=$OAUTH_EMAIL" \
  --data-urlencode "sub=google-subject-1")

echo "$GOOGLE_CALLBACK_JSON" | jq
export GOOGLE_USER_ID=$(echo "$GOOGLE_CALLBACK_JSON" | jq -r '.user.id')
```

Expected:
- HTTP `200`
- `user.linked_auth_methods.google == true`
- user email resolves to `oauth.manual@example.com`.

3. Subject-linking regression check (same subject, different email):

```bash
GOOGLE_START_JSON_2=$(curl -sS "$BASE_URL/auth/oauth/google/start")
GOOGLE_STATE_2=$(echo "$GOOGLE_START_JSON_2" | jq -r '.state')

GOOGLE_CALLBACK_JSON_2=$(curl -sS -G "$BASE_URL/auth/oauth/google/callback" \
  --data-urlencode "state=$GOOGLE_STATE_2" \
  --data-urlencode "code=google-manual-code-2" \
  --data-urlencode "email=different@example.com" \
  --data-urlencode "sub=google-subject-1")

echo "$GOOGLE_CALLBACK_JSON_2" | jq
```

Expected:
- HTTP `200`
- `user.id` is the same as `$GOOGLE_USER_ID`.

### 3B. Real provider mode (when credentials exist)

Set env vars before starting API:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`

Then:
1. `GET /auth/oauth/google/start`
2. Open returned `authorization_url` in browser.
3. Complete Google sign-in.
4. Verify callback returns `200` and links/creates account using verified token claims.

## Step 4 - #1.1.4 Apple OAuth

### 4A. Local fallback mode (no Apple credentials configured)

1. Start OAuth:

```bash
APPLE_START_JSON=$(curl -sS "$BASE_URL/auth/oauth/apple/start")
echo "$APPLE_START_JSON" | jq
export APPLE_STATE=$(echo "$APPLE_START_JSON" | jq -r '.state')
```

2. Callback:

```bash
APPLE_CALLBACK_JSON=$(curl -sS -G "$BASE_URL/auth/oauth/apple/callback" \
  --data-urlencode "state=$APPLE_STATE" \
  --data-urlencode "code=apple-manual-code-1" \
  --data-urlencode "sub=apple-subject-1")

echo "$APPLE_CALLBACK_JSON" | jq
```

Expected:
- HTTP `200`
- `user.linked_auth_methods.apple == true`

3. Optional POST callback shape test (`response_mode=form_post` compatibility):

```bash
APPLE_START_JSON_POST=$(curl -sS "$BASE_URL/auth/oauth/apple/start")
APPLE_STATE_POST=$(echo "$APPLE_START_JSON_POST" | jq -r '.state')

curl -i -X POST "$BASE_URL/auth/oauth/apple/callback" \
  -H "Content-Type: application/json" \
  -d "{
    \"state\":\"$APPLE_STATE_POST\",
    \"code\":\"apple-manual-code-post\",
    \"sub\":\"apple-subject-post-1\",
    \"user\":\"{\\\"email\\\":\\\"apple-post@example.com\\\"}\"
  }"
```

Expected:
- HTTP `201`
- user is created or linked successfully.

### 4B. Real provider mode (when credentials exist)

Set env vars before starting API:

- `APPLE_OAUTH_CLIENT_ID`
- `APPLE_OAUTH_TEAM_ID`
- `APPLE_OAUTH_KEY_ID`
- `APPLE_OAUTH_PRIVATE_KEY`
- `APPLE_OAUTH_REDIRECT_URI`

Then:
1. `GET /auth/oauth/apple/start`
2. Open returned `authorization_url`.
3. Complete Apple sign-in.
4. Confirm callback (GET or POST form post) returns valid auth payload.

## Step 5 - #1.1.5 Sessions (logout and expiry)

### 5A. Logout invalidates session token

1. Register a new user:

```bash
SESSION_REGISTER_JSON=$(curl -sS -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"session.manual@example.com"}')
export SESSION_TOKEN=$(echo "$SESSION_REGISTER_JSON" | jq -r '.access_token')
echo "$SESSION_REGISTER_JSON" | jq
```

2. Read profile with token:

```bash
curl -i "$BASE_URL/me" -H "Authorization: Bearer $SESSION_TOKEN"
```

Expected: HTTP `200`.

3. Logout:

```bash
curl -i -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer $SESSION_TOKEN"
```

Expected: HTTP `201`, body `{ "status": "ok" }`.

4. Reuse old token:

```bash
curl -i "$BASE_URL/me" -H "Authorization: Bearer $SESSION_TOKEN"
```

Expected: HTTP `401`, `code: "UNAUTHORIZED"`.

### 5B. Session TTL expiry

Restart API with short TTL:

```bash
cd /Users/justinpaoletta/Desktop/PROJECTS/APPS/BitStockerz/apps/api
AUTH_SESSION_TTL_SECONDS=1 npm run start:dev
```

Then:

```bash
TTL_REGISTER_JSON=$(curl -sS -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"ttl.manual@example.com"}')
TTL_TOKEN=$(echo "$TTL_REGISTER_JSON" | jq -r '.access_token')
sleep 2
curl -i "$BASE_URL/me" -H "Authorization: Bearer $TTL_TOKEN"
```

Expected:
- HTTP `401` after TTL window.

## Step 6 - #1.1.6 Account Recovery/Lost Device Path (minimum)

Current backend interpretation of this MVP path:
- Recovery is via OAuth login/linking when passkey device is unavailable.

Manual check:

1. Create a base account and capture the user ID:

```bash
REC_REGISTER_JSON=$(curl -sS -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$RECOVERY_EMAIL\"}")
echo "$REC_REGISTER_JSON" | jq
REC_USER_ID=$(echo "$REC_REGISTER_JSON" | jq -r '.user.id')
```

2. Execute Google fallback callback with the same `email`:

```bash
REC_GOOGLE_START=$(curl -sS "$BASE_URL/auth/oauth/google/start")
REC_GOOGLE_STATE=$(echo "$REC_GOOGLE_START" | jq -r '.state')

REC_GOOGLE_CALLBACK_JSON=$(curl -sS -G "$BASE_URL/auth/oauth/google/callback" \
  --data-urlencode "state=$REC_GOOGLE_STATE" \
  --data-urlencode "code=google-recovery-code" \
  --data-urlencode "email=$RECOVERY_EMAIL" \
  --data-urlencode "sub=google-recovery-subject")

echo "$REC_GOOGLE_CALLBACK_JSON" | jq
REC_GOOGLE_USER_ID=$(echo "$REC_GOOGLE_CALLBACK_JSON" | jq -r '.user.id')
```

3. Compare callback `user.id` to `REC_USER_ID`:

```bash
echo "$REC_USER_ID"
echo "$REC_GOOGLE_USER_ID"
```

Expected:
- Existing user is linked to Google instead of creating a duplicate.

## Step 7 - #1.2.1 View Profile

With any valid bearer token:

```bash
curl -i "$BASE_URL/me" -H "Authorization: Bearer $PASSKEY_TOKEN"
curl -i "$BASE_URL/auth/me" -H "Authorization: Bearer $PASSKEY_TOKEN"
```

Expected:
- HTTP `200`
- Both routes return same profile shape.

Negative:

```bash
curl -i "$BASE_URL/me"
```

Expected:
- HTTP `401`

## Step 8 - #1.2.2 Update Profile Preferences

```bash
curl -i -X PATCH "$BASE_URL/me" \
  -H "Authorization: Bearer $PASSKEY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Manual Trader","base_currency":"USD"}'
```

Expected:
- HTTP `200`
- `display_name` reflects update.
- `base_currency` remains `USD`.

Blank-name normalization check:

```bash
curl -i -X PATCH "$BASE_URL/me" \
  -H "Authorization: Bearer $PASSKEY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"   "}'
```

Expected:
- HTTP `200`
- `display_name` becomes `null`/missing (trimmed away server-side).

## Step 9 - #1.4.1 Auth Rate Limiting

Restart API with strict limits:

```bash
cd /Users/justinpaoletta/Desktop/PROJECTS/APPS/BitStockerz/apps/api
AUTH_RATE_LIMIT_MAX_REQUESTS=1 AUTH_RATE_LIMIT_WINDOW_MS=60000 npm run start:dev
```

Then:

```bash
curl -i "$BASE_URL/auth/oauth/google/start"
curl -i "$BASE_URL/auth/oauth/google/start"
```

Expected:
- First request HTTP `200`
- Second request HTTP `429` with `code: "RATE_LIMITED"`

## Real Verification Mode Setup Checklist (when credentials are available)

Use this env set for full provider + cryptographic verification:

```bash
NODE_ENV=production \
WEBAUTHN_RP_ID="<your-rp-domain>" \
WEBAUTHN_RP_NAME="BitStockerz" \
WEBAUTHN_ALLOWED_ORIGINS="https://<your-rp-domain>,https://www.<your-rp-domain>" \
GOOGLE_OAUTH_CLIENT_ID="<google-client-id>" \
GOOGLE_OAUTH_CLIENT_SECRET="<google-client-secret>" \
GOOGLE_OAUTH_REDIRECT_URI="https://<your-rp-domain>/api/auth/oauth/google/callback" \
APPLE_OAUTH_CLIENT_ID="<apple-client-id>" \
APPLE_OAUTH_TEAM_ID="<apple-team-id>" \
APPLE_OAUTH_KEY_ID="<apple-key-id>" \
APPLE_OAUTH_PRIVATE_KEY="<apple-private-key-with-\\n-escapes>" \
APPLE_OAUTH_REDIRECT_URI="https://<your-rp-domain>/api/auth/oauth/apple/callback" \
npm run start:dev
```

Expected in production mode:
- Missing provider settings should fail fast on startup (config validation).
- Missing `WEBAUTHN_ALLOWED_ORIGINS` should fail WebAuthn verification paths with a clear internal error.

## Defect Logging Template

For any failure, capture:

1. Story ID and step number from this guide.
2. Exact request payload.
3. Response status and body.
4. Expected result vs actual result.
5. API logs for the same `requestId`.
