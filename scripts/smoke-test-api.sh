#!/usr/bin/env bash
# BitStockerz API smoke tests — logs pass/fail per scenario.
# Usage: ./scripts/smoke-test-api.sh [--sprint 1.2|1.3|all] [--base-url URL]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPRINT_SCOPE="${SPRINT_SCOPE:-all}"
BASE_URL="${BASE_URL:-http://localhost:4000/api}"
LOG_DIR="$ROOT/logs/smoke"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/smoke-$TIMESTAMP.log"

PASS=0
FAIL=0
SKIP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sprint) SPRINT_SCOPE="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

record_pass() {
  PASS=$((PASS + 1))
  log "PASS: $1"
}

record_fail() {
  FAIL=$((FAIL + 1))
  log "FAIL: $1"
  if [[ -n "${2:-}" ]]; then
    log "      detail: $2"
  fi
}

record_skip() {
  SKIP=$((SKIP + 1))
  log "SKIP: $1 — ${2:-no reason}"
}

wait_for_api() {
  local attempts=60
  log "Waiting for API at $BASE_URL/health/live ..."
  for ((i = 1; i <= attempts; i++)); do
    if curl -sf "$BASE_URL/health/live" >/dev/null 2>&1; then
      log "API is up (attempt $i)"
      return 0
    fi
    sleep 1
  done
  record_fail "API health check" "not reachable after ${attempts}s"
  return 1
}

http_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local tmp
  tmp="$(mktemp)"
  local code
  if [[ -n "$body" ]]; then
    code="$(curl -s -o "$tmp" -w "%{http_code}" -X "$method" \
      -H 'Content-Type: application/json' \
      -d "$body" \
      "$BASE_URL$path")"
  else
    code="$(curl -s -o "$tmp" -w "%{http_code}" -X "$method" "$BASE_URL$path")"
  fi
  HTTP_CODE="$code"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

auth_header() {
  curl -s -H "Authorization: Bearer $TOKEN" "$@"
}

run_sprint_12() {
  log "=== Sprint 1.2 — equity & crypto candles ==="

  http_json GET "/market-data/equities/candles?symbol=aapl&start=2026-01-05&end=2026-01-09"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e 'length == 5' >/dev/null 2>&1; then
    record_pass "1.2 equity ascending AAPL (5 bars)"
  else
    record_fail "1.2 equity ascending AAPL" "http=$HTTP_CODE body=$(echo "$HTTP_BODY" | head -c 200)"
  fi

  http_json GET "/market-data/equities/candles?symbol=AAPL&start=2026-01-05&end=2026-01-09&order=desc&limit=2"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e '.[0].date == "2026-01-09" and length == 2' >/dev/null 2>&1; then
    record_pass "1.2 equity desc limit=2"
  else
    record_fail "1.2 equity desc limit=2" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/equities/candles?symbol=AAPL&start=2025-01-01&end=2025-01-31"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e 'length == 0' >/dev/null 2>&1; then
    record_pass "1.2 equity empty range"
  else
    record_fail "1.2 equity empty range" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/equities/candles?symbol=BTC-USD&start=2026-01-05&end=2026-01-09"
  if [[ "$HTTP_CODE" == "400" ]] && echo "$HTTP_BODY" | jq -e '.code == "VALIDATION_ERROR"' >/dev/null 2>&1; then
    record_pass "1.2 equity wrong asset type"
  else
    record_fail "1.2 equity wrong asset type" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/equities/candles?symbol=NOPE&start=2026-01-05&end=2026-01-09"
  if [[ "$HTTP_CODE" == "404" ]] && echo "$HTTP_BODY" | jq -e '.code == "NOT_FOUND"' >/dev/null 2>&1; then
    record_pass "1.2 equity unknown symbol"
  else
    record_fail "1.2 equity unknown symbol" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/crypto/candles?symbol=btc-usd&interval=1d&start=2026-01-01&end=2026-01-03"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e 'length == 3 and (.[0] | has("date"))' >/dev/null 2>&1; then
    record_pass "1.2 crypto daily BTC-USD"
  else
    record_fail "1.2 crypto daily BTC-USD" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/crypto/candles?symbol=BTC-USD&interval=1h&start=2026-01-15T00:00:00.000Z&end=2026-01-15T02:00:00.000Z"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e 'length == 3 and (.[0] | has("timestamp"))' >/dev/null 2>&1; then
    record_pass "1.2 crypto hourly BTC-USD"
  else
    record_fail "1.2 crypto hourly BTC-USD" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/crypto/candles?symbol=AAPL&interval=1d&start=2026-01-01&end=2026-01-03"
  if [[ "$HTTP_CODE" == "400" ]] && echo "$HTTP_BODY" | jq -e '.code == "VALIDATION_ERROR"' >/dev/null 2>&1; then
    record_pass "1.2 crypto wrong asset type"
  else
    record_fail "1.2 crypto wrong asset type" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/equities/candles?symbol=AAPL&start=2026-02-01&end=2026-01-01"
  if [[ "$HTTP_CODE" == "400" ]] && echo "$HTTP_BODY" | jq -e '.code == "VALIDATION_ERROR"' >/dev/null 2>&1; then
    record_pass "1.2 reversed date range"
  else
    record_fail "1.2 reversed date range" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/equities/candles?symbol=AAPL&start=2026-01-05&end=2026-01-09&limit=0"
  if [[ "$HTTP_CODE" == "400" ]] && echo "$HTTP_BODY" | jq -e '.code == "VALIDATION_ERROR"' >/dev/null 2>&1; then
    record_pass "1.2 invalid limit"
  else
    record_fail "1.2 invalid limit" "http=$HTTP_CODE"
  fi
}

run_sprint_13() {
  log "=== Sprint 1.3 — jobs & ingestion ==="

  local email="smoke-$(date +%s)@example.com"
  http_json POST "/auth/register" "{\"email\":\"$email\",\"display_name\":\"Smoke Runner\"}"
  if [[ "$HTTP_CODE" != "201" && "$HTTP_CODE" != "200" ]]; then
    record_fail "1.3 auth register" "http=$HTTP_CODE"
    return 1
  fi
  TOKEN="$(echo "$HTTP_BODY" | jq -r '.access_token')"
  if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    record_fail "1.3 auth register" "missing access_token"
    return 1
  fi
  record_pass "1.3 auth register"

  local tmp
  tmp="$(mktemp)"
  local code
  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"symbol":"AAPL"}' \
    "$BASE_URL/market-data/ingestion/equity")"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
  if [[ "$code" == "201" ]] && echo "$HTTP_BODY" | jq -e '.status == "completed" and .payload.imported_equity_bars == 40' >/dev/null 2>&1; then
    record_pass "1.3 equity ingestion AAPL"
  else
    record_fail "1.3 equity ingestion AAPL" "http=$code body=$(echo "$HTTP_BODY" | head -c 300)"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"symbol":"BTC-USD","intervals":["1d","1h"]}' \
    "$BASE_URL/market-data/ingestion/crypto")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "201" ]] && echo "$HTTP_BODY" | jq -e '.status == "completed" and .payload.imported_crypto_daily_bars == 30 and .payload.imported_crypto_hourly_bars == 48' >/dev/null 2>&1; then
    record_pass "1.3 crypto ingestion BTC-USD"
  else
    record_fail "1.3 crypto ingestion BTC-USD" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"job_type":"equity_daily_import"}' \
    "$BASE_URL/jobs")"
  local job_id
  job_id="$(cat "$tmp" | jq -r '.id')"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "201" ]] && echo "$HTTP_BODY" | jq -e '.status == "completed"' >/dev/null 2>&1; then
    record_pass "1.3 POST /jobs equity_daily_import"
  else
    record_fail "1.3 POST /jobs" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/jobs/$job_id")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e ".id == \"$job_id\"" >/dev/null 2>&1; then
    record_pass "1.3 GET /jobs/:id"
  else
    record_fail "1.3 GET /jobs/:id" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H 'Content-Type: application/json' \
    -d '{"job_type":"equity_daily_import"}' \
    "$BASE_URL/jobs")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "401" ]] && echo "$HTTP_BODY" | jq -e '.code == "UNAUTHORIZED"' >/dev/null 2>&1; then
    record_pass "1.3 unauthenticated jobs rejected"
  else
    record_fail "1.3 unauthenticated jobs" "http=$code"
  fi
  rm -f "$tmp"
}

run_db_persisted_candles() {
  # Only when the caller already exported DATABASE_URL (e.g. KEEP_DATABASE_URL=1).
  # Do not reload apps/api/.env here: default verify starts the API in seed mode
  # while .env may still define DATABASE_URL, which would falsely pass as "MySQL".
  if [[ -z "${DATABASE_URL:-}" ]]; then
    record_skip "1.3 persisted candles after ingestion" "DATABASE_URL not set (seed mode)"
    return 0
  fi
  log "=== DB mode — candles after ingestion ==="
  http_json GET "/market-data/equities/candles?symbol=AAPL&start=2026-01-05&end=2026-01-09"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e 'length > 0' >/dev/null 2>&1; then
    record_pass "DB persisted equity candles"
  else
    record_fail "DB persisted equity candles" "http=$HTTP_CODE (empty or error)"
  fi
}

main() {
  log "Smoke test started — scope=$SPRINT_SCOPE base=$BASE_URL"
  log "Log file: $LOG_FILE"

  command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }
  command -v curl >/dev/null 2>&1 || { echo "curl required" >&2; exit 1; }

  wait_for_api

  case "$SPRINT_SCOPE" in
    1.2) run_sprint_12 ;;
    1.3) run_sprint_13; run_db_persisted_candles ;;
    all)
      run_sprint_12
      run_sprint_13
      run_db_persisted_candles
      ;;
    *) echo "Invalid --sprint: $SPRINT_SCOPE (use 1.2, 1.3, or all)" >&2; exit 1 ;;
  esac

  log "=== Summary: $PASS passed, $FAIL failed, $SKIP skipped ==="
  if [[ "$FAIL" -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
