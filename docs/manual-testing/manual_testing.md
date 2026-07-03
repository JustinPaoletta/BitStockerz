# Manual Testing Checklist

Run this entire file before merging backend PRs that touch completed scope.

**Covers:** Sprint 0.1 (infra), 0.2 (auth), 1.1 (symbols)  
**Skip for now:** paper accounts, candle APIs, trading, backtesting, dashboard, AI  
**Needs:** Node `24.11.1`, `curl`, `jq`  
**Note:** Auth state is in-memory. Restarting the API clears users, sessions, and OAuth state.

Last updated: 2026-07-02

---

## Setup

```bash
cd /Users/justinpaoletta/Desktop/PROJECTS/JP/BitStockerz/apps/api
npm install
npm run start:dev
```

In a second terminal:

```bash
export BASE_URL="http://localhost:3000/api"
export PASSKEY_EMAIL="passkey.manual@example.com"
export OAUTH_EMAIL="oauth.manual@example.com"
export RECOVERY_EMAIL="recovery.manual@example.com"
export REQUEST_ID="manual-regression-001"
```

**Restart rule:** After any step that starts the API with custom env vars, stop it and run plain `npm run start:dev` before the next section.

---

## 1. Foundation (Sprint 0.1)

```bash
# 1.1 live → 200 {"status":"ok"}
curl -i "$BASE_URL/health/live"

# 1.2 ready (no DATABASE_URL) → 200, ready:true, status:"ok"
curl -i "$BASE_URL/health/ready"

# 1.3 invalid config → startup fails with "Invalid configuration"
# Stop API first, then:
PORT=abc npm run start:dev

# 1.4 ready when DB unreachable → 503, ready:false, checks.database.status:"down"
# Stop API first, then:
DATABASE_URL=postgres://127.0.0.1:1/bitstockerz READINESS_TIMEOUT_MS=300 npm run start:dev
curl -i "$BASE_URL/health/ready"

# 1.5 API boots with MySQL URL even if DB is down → live 200, ready 503
# Stop API first, then:
DATABASE_URL=mysql://127.0.0.1:1/bitstockerz npm run start:dev
curl -i "$BASE_URL/health/live"
curl -i "$BASE_URL/health/ready"

# Restart normally before continuing.

# 1.6 request ID echoed in header and error body
curl -i -H "x-request-id: $REQUEST_ID" "$BASE_URL/health/live"
curl -i -H "x-request-id: $REQUEST_ID" "$BASE_URL/error-test/unauthorized"

# 1.7 error contract → RFC7807 + code + requestId (no stack on /internal)
curl -i "$BASE_URL/error-test/unauthorized"
curl -i "$BASE_URL/error-test/forbidden"
curl -i "$BASE_URL/error-test/conflict"
curl -i "$BASE_URL/error-test/rate-limited"
curl -i "$BASE_URL/error-test/internal"

# 1.8 log redaction → request succeeds; logs must not show raw Authorization/Cookie
curl -i -H "Authorization: Bearer secret-value" -H "Cookie: session=abc" "$BASE_URL/health/live"

# 1.9 validation errors → 400 VALIDATION_ERROR + fieldErrors
curl -i -X POST "$BASE_URL/strategies" -H "Content-Type: application/json" -d '{"name":"Test Strat","asset_type":"EQUITY","timeframe":"1d"}'
curl -i -X POST "$BASE_URL/strategies" -H "Content-Type: application/json" -d '{"name":123}'
```

---

## 2. Passkey auth (Sprint 0.2)

```bash
# 2.1 register
REG_OPTIONS_JSON=$(curl -sS -X POST "$BASE_URL/auth/webauthn/register/options" \
  -H "Content-Type: application/json" -d "{\"email\":\"$PASSKEY_EMAIL\"}")
export REG_CHALLENGE_ID=$(echo "$REG_OPTIONS_JSON" | jq -r '.challenge_id')
export REG_CHALLENGE=$(echo "$REG_OPTIONS_JSON" | jq -r '.challenge')
# → 201, challenge_id + challenge present

REGISTER_VERIFY_JSON=$(curl -sS -X POST "$BASE_URL/auth/webauthn/register/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PASSKEY_EMAIL\",\"challenge_id\":\"$REG_CHALLENGE_ID\",\"challenge\":\"$REG_CHALLENGE\",\"credential_id\":\"manual-cred-1\",\"public_key\":\"manual-public-key-1\",\"sign_count\":1,\"transports\":[\"internal\"]}")
export PASSKEY_TOKEN=$(echo "$REGISTER_VERIFY_JSON" | jq -r '.access_token')
# → 201, bearer token, linked_auth_methods.passkeys:true

# 2.2 login
LOGIN_OPTIONS_JSON=$(curl -sS -X POST "$BASE_URL/auth/webauthn/login/options" \
  -H "Content-Type: application/json" -d "{\"email\":\"$PASSKEY_EMAIL\"}")
export LOGIN_CHALLENGE_ID=$(echo "$LOGIN_OPTIONS_JSON" | jq -r '.challenge_id')
export LOGIN_CHALLENGE=$(echo "$LOGIN_OPTIONS_JSON" | jq -r '.challenge')
# → 201, allow_credentials includes manual-cred-1

curl -sS -X POST "$BASE_URL/auth/webauthn/login/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PASSKEY_EMAIL\",\"challenge_id\":\"$LOGIN_CHALLENGE_ID\",\"challenge\":\"$LOGIN_CHALLENGE\",\"credential_id\":\"manual-cred-1\",\"sign_count\":2}"
# → 201, bearer token

# 2.3 stale sign counter → 401 UNAUTHORIZED
LOGIN_OPTIONS_REPLAY_JSON=$(curl -sS -X POST "$BASE_URL/auth/webauthn/login/options" \
  -H "Content-Type: application/json" -d "{\"email\":\"$PASSKEY_EMAIL\"}")
curl -i -X POST "$BASE_URL/auth/webauthn/login/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PASSKEY_EMAIL\",\"challenge_id\":\"$(echo "$LOGIN_OPTIONS_REPLAY_JSON" | jq -r '.challenge_id')\",\"challenge\":\"$(echo "$LOGIN_OPTIONS_REPLAY_JSON" | jq -r '.challenge')\",\"credential_id\":\"manual-cred-1\",\"sign_count\":2}"
```

---

## 3. OAuth (Sprint 0.2)

```bash
# 3.1 Google start + callback → 200, linked_auth_methods.google:true
GOOGLE_START_JSON=$(curl -sS "$BASE_URL/auth/oauth/google/start")
export GOOGLE_STATE=$(echo "$GOOGLE_START_JSON" | jq -r '.state')
GOOGLE_CALLBACK_JSON=$(curl -sS -G "$BASE_URL/auth/oauth/google/callback" \
  --data-urlencode "state=$GOOGLE_STATE" \
  --data-urlencode "code=google-manual-code-1" \
  --data-urlencode "email=$OAUTH_EMAIL" \
  --data-urlencode "sub=google-subject-1")
export GOOGLE_USER_ID=$(echo "$GOOGLE_CALLBACK_JSON" | jq -r '.user.id')

# 3.2 Google re-link same sub → same user.id (no duplicate account)
GOOGLE_START_JSON_2=$(curl -sS "$BASE_URL/auth/oauth/google/start")
curl -sS -G "$BASE_URL/auth/oauth/google/callback" \
  --data-urlencode "state=$(echo "$GOOGLE_START_JSON_2" | jq -r '.state')" \
  --data-urlencode "code=google-manual-code-2" \
  --data-urlencode "email=different@example.com" \
  --data-urlencode "sub=google-subject-1" | jq -r '.user.id'
# → must equal $GOOGLE_USER_ID

# 3.3 Apple GET callback → 200, linked_auth_methods.apple:true
APPLE_START_JSON=$(curl -sS "$BASE_URL/auth/oauth/apple/start")
curl -sS -G "$BASE_URL/auth/oauth/apple/callback" \
  --data-urlencode "state=$(echo "$APPLE_START_JSON" | jq -r '.state')" \
  --data-urlencode "code=apple-manual-code-1" \
  --data-urlencode "sub=apple-subject-1"

# 3.4 Apple POST callback → 201
APPLE_START_JSON_POST=$(curl -sS "$BASE_URL/auth/oauth/apple/start")
curl -i -X POST "$BASE_URL/auth/oauth/apple/callback" \
  -H "Content-Type: application/json" \
  -d "{\"state\":\"$(echo "$APPLE_START_JSON_POST" | jq -r '.state')\",\"code\":\"apple-manual-code-post\",\"sub\":\"apple-subject-post-1\",\"user\":\"{\\\"email\\\":\\\"apple-post@example.com\\\"}\"}"
```

---

## 4. Session and profile (Sprint 0.2)

```bash
SESSION_REGISTER_JSON=$(curl -sS -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" -d '{"email":"session.manual@example.com"}')
export SESSION_TOKEN=$(echo "$SESSION_REGISTER_JSON" | jq -r '.access_token')

# 4.1 profile read → both /me routes return 200
curl -i "$BASE_URL/me" -H "Authorization: Bearer $SESSION_TOKEN"
curl -i "$BASE_URL/auth/me" -H "Authorization: Bearer $SESSION_TOKEN"

# 4.2 profile update → 200, display_name updated
curl -i -X PATCH "$BASE_URL/me" -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" -d '{"display_name":"Manual Trader","base_currency":"USD"}'

# 4.3 blank display_name → cleared
curl -i -X PATCH "$BASE_URL/me" -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" -d '{"display_name":"   "}'

# 4.4 unauthenticated → 401
curl -i "$BASE_URL/me"

# 4.5 logout → 201; old token → 401
curl -i -X POST "$BASE_URL/auth/logout" -H "Authorization: Bearer $SESSION_TOKEN"
curl -i "$BASE_URL/me" -H "Authorization: Bearer $SESSION_TOKEN"

# 4.6 session expiry
# Stop API, then: AUTH_SESSION_TTL_SECONDS=1 npm run start:dev
TTL_REGISTER_JSON=$(curl -sS -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" -d '{"email":"ttl.manual@example.com"}')
sleep 2
curl -i "$BASE_URL/me" -H "Authorization: Bearer $(echo "$TTL_REGISTER_JSON" | jq -r '.access_token')"
# → 401

# Restart normally before continuing.
```

---

## 5. Recovery and rate limits (Sprint 0.2)

```bash
# 5.1 OAuth recovery links to existing user (same user.id)
REC_REGISTER_JSON=$(curl -sS -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" -d "{\"email\":\"$RECOVERY_EMAIL\"}")
REC_USER_ID=$(echo "$REC_REGISTER_JSON" | jq -r '.user.id')
REC_GOOGLE_START=$(curl -sS "$BASE_URL/auth/oauth/google/start")
REC_GOOGLE_CALLBACK_JSON=$(curl -sS -G "$BASE_URL/auth/oauth/google/callback" \
  --data-urlencode "state=$(echo "$REC_GOOGLE_START" | jq -r '.state')" \
  --data-urlencode "code=google-recovery-code" \
  --data-urlencode "email=$RECOVERY_EMAIL" \
  --data-urlencode "sub=google-recovery-subject")
echo "$REC_USER_ID"
echo "$REC_GOOGLE_CALLBACK_JSON" | jq -r '.user.id'
# → IDs must match

# 5.2 auth rate limit
# Stop API, then: AUTH_RATE_LIMIT_MAX_REQUESTS=1 AUTH_RATE_LIMIT_WINDOW_MS=60000 npm run start:dev
curl -i "$BASE_URL/auth/oauth/google/start"
curl -i "$BASE_URL/auth/oauth/google/start"
# → first 200, second 429 RATE_LIMITED

# Restart normally before continuing.
```

---

## 6. Market data symbols (Sprint 1.1)

No `DATABASE_URL` → in-memory seed data. With MySQL/MariaDB, set `DATABASE_URL` and run `npm run db:migrate` first.

```bash
# 6.1 lookup (case-insensitive) → 200, symbol AAPL, asset_type EQUITY
curl -i "$BASE_URL/symbols/aapl"

# 6.2 search with filters → 200, one result BTC-USD
curl -i "$BASE_URL/symbols/search?q=usd&asset_type=CRYPTO&limit=1"

# 6.3 unknown symbol → 404 NOT_FOUND
curl -i "$BASE_URL/symbols/NOPE"

# 6.4 invalid asset_type → 400 VALIDATION_ERROR + fieldErrors
curl -i "$BASE_URL/symbols/search?asset_type=INVALID"
```

---

## If something fails

Log: step number, request, response status/body, expected vs actual, and `requestId` from the response.

Real Google/Apple token exchange and browser WebAuthn are not required for local MVP testing.
