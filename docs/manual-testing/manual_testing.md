# Manual Testing Checklist

Current backend scope only.

Test now:
- Sprint `0.1`: `#8.3.1`, `#8.4.1`, `#8.5.1`, `#8.6.2`
- Sprint `0.2`: `#1.1.1` to `#1.1.6`, `#1.2.1`, `#1.2.2`, `#1.4.1`
- Sprint `1.1`: `#2.1.1`, `#2.1.2`, `#2.1.3`, `#2.2.1`, `#2.3.1`, `#2.4.1`

Do not test yet:
- `#1.3.1` paper account creation
- candle read APIs (`#2.2.3`, `#2.3.3`)
- paper trading
- backtesting
- dashboard/frontend
- AI/kernel

Last updated: 2026-07-02

## Start

```bash
cd /Users/justinpaoletta/Desktop/PROJECTS/JP/BitStockerz/apps/api
npm install
npm run start:dev
```

```bash
export BASE_URL="http://localhost:3000/api"
export PASSKEY_EMAIL="passkey.manual@example.com"
export OAUTH_EMAIL="oauth.manual@example.com"
export RECOVERY_EMAIL="recovery.manual@example.com"
export REQUEST_ID="manual-regression-001"
```

## Test Now

### 1. Foundation

Health live:

```bash
curl -i "$BASE_URL/health/live"
```

Expected:
- HTTP `200`
- `{"status":"ok"}`

Readiness without optional dependencies:

```bash
curl -i "$BASE_URL/health/ready"
```

Expected:
- HTTP `200`
- `ready: true`
- `status: "ok"`

Invalid config fails fast:

```bash
PORT=abc npm run start:dev
```

Expected:
- startup fails
- error contains `Invalid configuration`

Readiness degraded when dependency is down:

```bash
DATABASE_URL=postgres://127.0.0.1:1/bitstockerz READINESS_TIMEOUT_MS=300 npm run start:dev
```

```bash
curl -i "$BASE_URL/health/ready"
```

Expected:
- HTTP `503`
- `ready: false`
- `status: "degraded"`

Restart normally before continuing.

Request ID echo:

```bash
curl -i -H "x-request-id: $REQUEST_ID" "$BASE_URL/health/live"
curl -i -H "x-request-id: $REQUEST_ID" "$BASE_URL/error-test/unauthorized"
```

Expected:
- response header contains `x-request-id`
- error body contains matching `requestId`

Error contract routes:

```bash
curl -i "$BASE_URL/error-test/unauthorized"
curl -i "$BASE_URL/error-test/forbidden"
curl -i "$BASE_URL/error-test/conflict"
curl -i "$BASE_URL/error-test/rate-limited"
curl -i "$BASE_URL/error-test/internal"
```

Expected for each:
- RFC7807 body
- includes `type`, `title`, `status`, `detail`, `instance`, `code`, `requestId`
- internal error does not leak stack trace

Log redaction:

```bash
curl -i \
  -H "Authorization: Bearer secret-value" \
  -H "Cookie: session=abc" \
  "$BASE_URL/health/live"
```

Expected:
- request succeeds
- logs do not show raw auth or cookie values

Optional file logging:

```bash
LOG_TO_FILE=true LOG_FILE_PATH=./logs/api-manual-test.log npm run start:dev
```

```bash
curl -i "$BASE_URL/health/live"
```

Expected:
- log file is written

Restart normally before continuing.

Strategy endpoint canary:

```bash
curl -i -X POST "$BASE_URL/strategies" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Strat","asset_type":"EQUITY","timeframe":"1d"}'
```

Expected:
- HTTP `200` or `201`
- response includes `id`, `name`, `asset_type`, `timeframe`

```bash
curl -i -X POST "$BASE_URL/strategies" \
  -H "Content-Type: application/json" \
  -d '{"name":123}'
```

Expected:
- HTTP `400`
- `code: "VALIDATION_ERROR"`
- `fieldErrors` present

### 2. Passkey Auth

Register options:

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
- `challenge_id` and `challenge` present

Register verify, local fallback payload:

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
```

Expected:
- HTTP `201`
- bearer token returned
- `linked_auth_methods.passkeys == true`

Login options:

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
- `allow_credentials` includes `manual-cred-1`

Login verify:

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
- bearer token returned

Negative stale counter:

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

### 3. OAuth

Google start and callback:

```bash
GOOGLE_START_JSON=$(curl -sS "$BASE_URL/auth/oauth/google/start")
echo "$GOOGLE_START_JSON" | jq
export GOOGLE_STATE=$(echo "$GOOGLE_START_JSON" | jq -r '.state')

GOOGLE_CALLBACK_JSON=$(curl -sS -G "$BASE_URL/auth/oauth/google/callback" \
  --data-urlencode "state=$GOOGLE_STATE" \
  --data-urlencode "code=google-manual-code-1" \
  --data-urlencode "email=$OAUTH_EMAIL" \
  --data-urlencode "sub=google-subject-1")

echo "$GOOGLE_CALLBACK_JSON" | jq
export GOOGLE_USER_ID=$(echo "$GOOGLE_CALLBACK_JSON" | jq -r '.user.id')
```

Expected:
- start returns HTTP `200`
- callback returns HTTP `200`
- `linked_auth_methods.google == true`

Google subject re-link:

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
- callback returns same `user.id` as `$GOOGLE_USER_ID`

Apple start and callback:

```bash
APPLE_START_JSON=$(curl -sS "$BASE_URL/auth/oauth/apple/start")
echo "$APPLE_START_JSON" | jq
export APPLE_STATE=$(echo "$APPLE_START_JSON" | jq -r '.state')

APPLE_CALLBACK_JSON=$(curl -sS -G "$BASE_URL/auth/oauth/apple/callback" \
  --data-urlencode "state=$APPLE_STATE" \
  --data-urlencode "code=apple-manual-code-1" \
  --data-urlencode "sub=apple-subject-1")

echo "$APPLE_CALLBACK_JSON" | jq
```

Expected:
- start returns HTTP `200`
- callback returns HTTP `200`
- `linked_auth_methods.apple == true`

Apple POST callback shape:

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

### 4. Session and Profile

Register a session user:

```bash
SESSION_REGISTER_JSON=$(curl -sS -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"session.manual@example.com"}')

echo "$SESSION_REGISTER_JSON" | jq
export SESSION_TOKEN=$(echo "$SESSION_REGISTER_JSON" | jq -r '.access_token')
```

Profile read:

```bash
curl -i "$BASE_URL/me" -H "Authorization: Bearer $SESSION_TOKEN"
curl -i "$BASE_URL/auth/me" -H "Authorization: Bearer $SESSION_TOKEN"
```

Expected:
- both return HTTP `200`

Profile update:

```bash
curl -i -X PATCH "$BASE_URL/me" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Manual Trader","base_currency":"USD"}'
```

Expected:
- HTTP `200`
- updated `display_name`

Blank display name normalization:

```bash
curl -i -X PATCH "$BASE_URL/me" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"   "}'
```

Expected:
- HTTP `200`
- `display_name` is cleared

Unauthenticated profile:

```bash
curl -i "$BASE_URL/me"
```

Expected:
- HTTP `401`

Logout:

```bash
curl -i -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer $SESSION_TOKEN"
```

Expected:
- HTTP `201`
- `{ "status": "ok" }`

Old token rejected:

```bash
curl -i "$BASE_URL/me" -H "Authorization: Bearer $SESSION_TOKEN"
```

Expected:
- HTTP `401`

Session TTL:

```bash
AUTH_SESSION_TTL_SECONDS=1 npm run start:dev
```

```bash
TTL_REGISTER_JSON=$(curl -sS -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"ttl.manual@example.com"}')

TTL_TOKEN=$(echo "$TTL_REGISTER_JSON" | jq -r '.access_token')
sleep 2
curl -i "$BASE_URL/me" -H "Authorization: Bearer $TTL_TOKEN"
```

Expected:
- HTTP `401`

Restart normally before continuing.

### 5. Recovery and Rate Limits

Recovery via OAuth linking:

```bash
REC_REGISTER_JSON=$(curl -sS -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$RECOVERY_EMAIL\"}")

echo "$REC_REGISTER_JSON" | jq
REC_USER_ID=$(echo "$REC_REGISTER_JSON" | jq -r '.user.id')

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

Expected:
- `REC_GOOGLE_USER_ID` matches `REC_USER_ID`

Rate limiting:

```bash
AUTH_RATE_LIMIT_MAX_REQUESTS=1 AUTH_RATE_LIMIT_WINDOW_MS=60000 npm run start:dev
```

```bash
curl -i "$BASE_URL/auth/oauth/google/start"
curl -i "$BASE_URL/auth/oauth/google/start"
```

Expected:
- first request HTTP `200`
- second request HTTP `429`
- `code: "RATE_LIMITED"`

Restart normally after this check.

### 6. Market Data Symbols (Sprint 1.1)

Without `DATABASE_URL`, symbol endpoints use in-memory seed data. With `DATABASE_URL` set, run migrations first:

```bash
npm run db:migrate
```

Symbol lookup (case-insensitive):

```bash
curl -i "$BASE_URL/symbols/aapl"
```

Expected:
- HTTP `200`
- `symbol: "AAPL"`
- `asset_type: "EQUITY"`
- `name`, `exchange`, `currency`, and `is_active` present

Symbol search with filters:

```bash
curl -i "$BASE_URL/symbols/search?q=usd&asset_type=CRYPTO&limit=1"
```

Expected:
- HTTP `200`
- JSON array with one result
- first item has `symbol: "BTC-USD"`, `asset_type: "CRYPTO"`, `base_asset: "BTC"`, `quote_asset: "USD"`

Unknown symbol:

```bash
curl -i "$BASE_URL/symbols/NOPE"
```

Expected:
- HTTP `404`
- RFC7807 body with `code: "NOT_FOUND"`

Invalid search query:

```bash
curl -i "$BASE_URL/symbols/search?asset_type=INVALID"
```

Expected:
- HTTP `400`
- `code: "VALIDATION_ERROR"`
- `fieldErrors` present

## Advanced

Only run these when credentials and RP domain exist.

Test:
- real Google code exchange and token verification
- real Apple code exchange and token verification
- real cryptographic WebAuthn registration and login

Required env:

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

Expected:
- provider callbacks succeed with real credentials
- WebAuthn verification succeeds against real allowed origins
- missing production config fails fast or errors clearly

## Defect Logging

Capture:

1. Step name
2. Request payload
3. Response status and body
4. Expected vs actual
5. `requestId`
