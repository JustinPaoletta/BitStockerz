#!/usr/bin/env bash
# BitStockerz API smoke tests — logs pass/fail per scenario.
# Usage: ./scripts/smoke-test-api.sh [--sprint 1.2|1.3|2.1|2.2|2.3|3.3|4|all] [--base-url URL]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPRINT_SCOPE="${SPRINT_SCOPE:-all}"
BASE_URL="${BASE_URL:-http://localhost:4000/api}"
LOG_DIR="$ROOT/logs/smoke"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/smoke-$TIMESTAMP.log"
STRATEGY_STATE_FILE="${STRATEGY_SMOKE_STATE_FILE:-}"

PASS=0
FAIL=0
SKIP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sprint) SPRINT_SCOPE="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --strategy-state-file) STRATEGY_STATE_FILE="$2"; shift 2 ;;
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

http_auth_json() {
  local method="$1"
  local path="$2"
  local token="$3"
  local body="${4:-}"
  local tmp
  tmp="$(mktemp)"
  if [[ -n "$body" ]]; then
    HTTP_CODE="$(curl -s -o "$tmp" -w "%{http_code}" -X "$method" \
      -H "Authorization: Bearer $token" \
      -H 'Content-Type: application/json' \
      -d "$body" \
      "$BASE_URL$path")"
  else
    HTTP_CODE="$(curl -s -o "$tmp" -w "%{http_code}" -X "$method" \
      -H "Authorization: Bearer $token" \
      "$BASE_URL$path")"
  fi
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

auth_header() {
  curl -s -H "Authorization: Bearer $TOKEN" "$@"
}

candle_count_is_valid() {
  local expected="$1"
  local actual
  actual="$(echo "$HTTP_BODY" | jq -r 'length' 2>/dev/null)" || return 1
  if [[ -n "${DATABASE_URL:-}" ]]; then
    ((actual >= expected))
  else
    ((actual == expected))
  fi
}

run_sprint_12() {
  log "=== Sprint 1.2 — equity & crypto candles ==="

  # Seed bars roll to "today" (UTC); use a wide range and assert counts/shape.
  http_json GET "/market-data/equities/candles?symbol=aapl&start=2000-01-01&end=2099-12-31"
  if [[ "$HTTP_CODE" == "200" ]] &&
    candle_count_is_valid 40 &&
    echo "$HTTP_BODY" | jq -e 'length > 1 and (.[0].date < .[-1].date)' >/dev/null 2>&1; then
    record_pass "1.2 equity ascending AAPL (seed window present)"
  else
    record_fail "1.2 equity ascending AAPL" "http=$HTTP_CODE body=$(echo "$HTTP_BODY" | head -c 200)"
  fi

  http_json GET "/market-data/equities/candles?symbol=AAPL&start=2000-01-01&end=2099-12-31&order=desc&limit=2"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e 'length == 2 and (.[0].date > .[1].date)' >/dev/null 2>&1; then
    record_pass "1.2 equity desc limit=2"
  else
    record_fail "1.2 equity desc limit=2" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/equities/candles?symbol=AAPL&start=1990-01-01&end=1990-01-31"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e 'length == 0' >/dev/null 2>&1; then
    record_pass "1.2 equity empty range"
  else
    record_fail "1.2 equity empty range" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/equities/candles?symbol=BTC-USD&start=2000-01-01&end=2099-12-31"
  if [[ "$HTTP_CODE" == "400" ]] && echo "$HTTP_BODY" | jq -e '.code == "VALIDATION_ERROR"' >/dev/null 2>&1; then
    record_pass "1.2 equity wrong asset type"
  else
    record_fail "1.2 equity wrong asset type" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/equities/candles?symbol=NOPE&start=2000-01-01&end=2099-12-31"
  if [[ "$HTTP_CODE" == "404" ]] && echo "$HTTP_BODY" | jq -e '.code == "NOT_FOUND"' >/dev/null 2>&1; then
    record_pass "1.2 equity unknown symbol"
  else
    record_fail "1.2 equity unknown symbol" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/crypto/candles?symbol=btc-usd&interval=1d&start=2000-01-01&end=2099-12-31"
  if [[ "$HTTP_CODE" == "200" ]] &&
    candle_count_is_valid 30 &&
    echo "$HTTP_BODY" | jq -e '.[0] | has("date")' >/dev/null 2>&1; then
    record_pass "1.2 crypto daily BTC-USD"
  else
    record_fail "1.2 crypto daily BTC-USD" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/crypto/candles?symbol=BTC-USD&interval=1h&start=2000-01-01T00:00:00.000Z&end=2099-12-31T23:59:59.999Z"
  if [[ "$HTTP_CODE" == "200" ]] &&
    candle_count_is_valid 48 &&
    echo "$HTTP_BODY" | jq -e '.[0] | has("timestamp")' >/dev/null 2>&1; then
    record_pass "1.2 crypto hourly BTC-USD"
  else
    record_fail "1.2 crypto hourly BTC-USD" "http=$HTTP_CODE"
  fi

  http_json GET "/market-data/crypto/candles?symbol=AAPL&interval=1d&start=2000-01-01&end=2099-12-31"
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

  http_json GET "/market-data/equities/candles?symbol=AAPL&start=2000-01-01&end=2099-12-31&limit=0"
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

run_sprint_21() {
  log "=== Sprints 2.1–2.3 — strategy CRUD, versioning, validation, and rule schema ==="

  local definition
  definition='{"indicators":[{"id":"sma_fast","type":"SMA","params":{"period":10},"source":"close"},{"id":"sma_slow","type":"EMA","params":{"period":30},"source":"close"}],"entry":{"logic":"AND","conditions":[{"left":{"indicator":"sma_fast"},"op":"crosses_above","right":{"indicator":"sma_slow"}}]},"exit":{"logic":"AND","conditions":[{"left":{"indicator":"sma_fast"},"op":"crosses_below","right":{"indicator":"sma_slow"}}]},"risk":{"stop_loss":{"type":"percent","value":2},"take_profit":{"type":"percent","value":500}}}'

  http_json GET "/strategies/indicators"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.indicators | map(.key) == ["SMA", "EMA", "RSI"] and
     .[0].params[0].max == 200 and .[2].params[0].max == 100' >/dev/null 2>&1; then
    record_pass "2.2 public indicator catalog"
  else
    record_fail "2.2 public indicator catalog" "http=$HTTP_CODE"
  fi

  local email="strategy-smoke-$(date +%s)-$$@example.com"
  http_json POST "/auth/register" "{\"email\":\"$email\",\"display_name\":\"Strategy Smoke\"}"
  if [[ "$HTTP_CODE" != "201" ]]; then
    record_fail "2.1 auth register" "http=$HTTP_CODE"
    return 1
  fi

  local strategy_token
  strategy_token="$(echo "$HTTP_BODY" | jq -r '.access_token')"
  if [[ -z "$strategy_token" || "$strategy_token" == "null" ]]; then
    record_fail "2.1 auth register" "missing access_token"
    return 1
  fi
  record_pass "2.1 auth register"

  local tmp
  tmp="$(mktemp)"
  local code
  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{name:"Smoke Momentum",asset_type:"EQUITY",timeframe:"1d",definition:$definition}')" \
    "$BASE_URL/strategies")"
  HTTP_BODY="$(cat "$tmp")"
  local strategy_id
  strategy_id="$(echo "$HTTP_BODY" | jq -r '.id')"
  if [[ "$code" == "201" ]] && echo "$HTTP_BODY" | jq -e \
    --argjson expected "$definition" \
    '.version_number == 1 and .symbol_scope == "SINGLE" and
     .is_active == true and .definition == $expected and
     (.summary | contains("Take profit 500%."))' >/dev/null 2>&1; then
    record_pass "2.1–2.3 create canonical strategy + version one + summary"
  else
    record_fail "2.1 create strategy" "http=$code body=$(echo "$HTTP_BODY" | head -c 300)"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" \
    -H "Authorization: Bearer $strategy_token" \
    "$BASE_URL/strategies/$strategy_id")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    --arg id "$strategy_id" --argjson expected "$definition" \
    '.id == $id and .version_number == 1 and
     .definition == $expected' >/dev/null 2>&1; then
    record_pass "2.1 get owned strategy"
  else
    record_fail "2.1 get owned strategy" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{name:" smoke momentum ",asset_type:"EQUITY",timeframe:"1d",definition:$definition}')" \
    "$BASE_URL/strategies")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "409" ]] && echo "$HTTP_BODY" | jq -e \
    '.code == "CONFLICT"' >/dev/null 2>&1; then
    record_pass "2.1 normalized duplicate name rejected"
  else
    record_fail "2.1 duplicate name conflict" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{name:"Smoke Straße",asset_type:"EQUITY",timeframe:"1d",definition:$definition}')" \
    "$BASE_URL/strategies")"
  if [[ "$code" != "201" ]]; then
    record_fail "2.1 Unicode name baseline" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{name:"Smoke Strasse",asset_type:"EQUITY",timeframe:"1d",definition:$definition}')" \
    "$BASE_URL/strategies")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "409" ]] && echo "$HTTP_BODY" | jq -e \
    '.code == "CONFLICT"' >/dev/null 2>&1; then
    record_pass "2.1 MySQL-compatible Unicode duplicate rejected"
  else
    record_fail "2.1 Unicode duplicate conflict" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{name:"Smoke Σήμα",asset_type:"EQUITY",timeframe:"1d",definition:$definition}')" \
    "$BASE_URL/strategies")"
  if [[ "$code" != "201" ]]; then
    record_fail "2.1 Greek Unicode name baseline" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{name:"Smoke ςημα",asset_type:"EQUITY",timeframe:"1d",definition:$definition}')" \
    "$BASE_URL/strategies")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "409" ]] && echo "$HTTP_BODY" | jq -e \
    '.code == "CONFLICT"' >/dev/null 2>&1; then
    record_pass "2.1 MySQL-compatible Greek duplicate rejected"
  else
    record_fail "2.1 Greek Unicode duplicate conflict" "http=$code"
  fi

  local excessive_take_profit
  excessive_take_profit="$(echo "$definition" | jq '.risk.take_profit.value = 500.01')"
  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$excessive_take_profit" \
      '{name:"Smoke Invalid TP",asset_type:"EQUITY",timeframe:"1d",definition:$definition}')" \
    "$BASE_URL/strategies")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "400" ]] && echo "$HTTP_BODY" | jq -e \
    '.code == "STRATEGY_VALIDATION_ERROR" and
     any(.fieldErrors[]; .field == "definition.risk.take_profit.value" and
       (.reason | startswith("RISK_VALUE_OUT_OF_RANGE:")))' >/dev/null 2>&1; then
    record_pass "2.2 take profit above 500% rejected"
  else
    record_fail "2.2 take profit ceiling" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{name:123,description:456,asset_type:"CRYPTO",timeframe:"1h",definition:$definition}')" \
    "$BASE_URL/strategies")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "400" ]] && echo "$HTTP_BODY" | jq -e \
    '.code == "VALIDATION_ERROR" and
     (.detail | contains("name must be a string")) and
     (.detail | contains("description must be a string"))' >/dev/null 2>&1; then
    record_pass "2.1 non-string text fields rejected"
  else
    record_fail "2.1 strict text validation" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{name:"Unauthorized",asset_type:"EQUITY",timeframe:"1d",definition:$definition}')" \
    "$BASE_URL/strategies")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "401" ]] && echo "$HTTP_BODY" | jq -e \
    '.code == "UNAUTHORIZED"' >/dev/null 2>&1; then
    record_pass "2.1 unauthenticated create rejected"
  else
    record_fail "2.1 unauthenticated create" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{definition:$definition}')" \
    "$BASE_URL/strategies/validate")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.is_valid == true and .errors == [] and
     (.summary | contains("Take profit 500%."))' >/dev/null 2>&1; then
    record_pass "2.3 inline validation + deterministic summary"
  else
    record_fail "2.3 inline validation" "http=$code"
  fi

  local invalid_definition
  invalid_definition="$(echo "$definition" | jq '.entry.conditions[0].op = "unknown"')"
  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$invalid_definition" \
      '{definition:$definition}')" \
    "$BASE_URL/strategies/validate")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.is_valid == false and .summary == null and
     .errors[0].code == "UNKNOWN_OPERATOR"' >/dev/null 2>&1; then
    record_pass "2.3 invalid definition dry-run"
  else
    record_fail "2.3 invalid definition dry-run" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X PUT \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d '{"description":null,"asset_type":"CRYPTO","timeframe":"1h"}' \
    "$BASE_URL/strategies/$strategy_id")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.version_number == 1 and .description == null and
     .asset_type == "CRYPTO" and .timeframe == "1h"' >/dev/null 2>&1; then
    record_pass "2.3 metadata-only update preserves version"
  else
    record_fail "2.3 metadata-only update" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" \
    -H "Authorization: Bearer $strategy_token" \
    "$BASE_URL/strategies?limit=1&offset=0")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    --arg id "$strategy_id" \
    '.limit == 1 and .offset == 0 and (.items | length) == 1 and
     .items[0].id == $id and (.items[0] | has("definition") | not)' >/dev/null 2>&1; then
    record_pass "2.3 owner list pagination without definitions"
  else
    record_fail "2.3 strategy list" "http=$code"
  fi

  local next_definition
  next_definition="$(echo "$definition" | jq '.indicators[0].params.period = 11')"
  code="$(curl -s -o "$tmp" -w "%{http_code}" -X PUT \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$next_definition" \
      '{definition:$definition}')" \
    "$BASE_URL/strategies/$strategy_id")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    --argjson expected "$next_definition" \
    '.version_number == 2 and .definition == $expected and
     (.summary | contains("SMA(11)"))' >/dev/null 2>&1; then
    record_pass "2.3 definition update appends version two"
  else
    record_fail "2.3 definition update" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" \
    -H "Authorization: Bearer $strategy_token" \
    "$BASE_URL/strategies/$strategy_id?version=1")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    --argjson expected "$definition" \
    '.version_number == 1 and .definition == $expected and
     .is_latest == false and (.version_created_at | type) == "string"' >/dev/null 2>&1; then
    record_pass "2.3 historical version read"
  else
    record_fail "2.3 historical version read" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $strategy_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{name:"Smoke Delete",asset_type:"EQUITY",timeframe:"1d",definition:$definition}')" \
    "$BASE_URL/strategies")"
  local delete_id
  delete_id="$(cat "$tmp" | jq -r '.id')"
  if [[ "$code" != "201" || -z "$delete_id" || "$delete_id" == "null" ]]; then
    record_fail "2.3 soft-delete target creation" "http=$code"
  else
    code="$(curl -s -o "$tmp" -w "%{http_code}" -X DELETE \
      -H "Authorization: Bearer $strategy_token" \
      "$BASE_URL/strategies/$delete_id")"
    if [[ "$code" == "204" && ! -s "$tmp" ]]; then
      record_pass "2.3 soft delete returns empty 204"
    else
      record_fail "2.3 soft delete" "http=$code body=$(cat "$tmp")"
    fi

    code="$(curl -s -o "$tmp" -w "%{http_code}" \
      -H "Authorization: Bearer $strategy_token" \
      "$BASE_URL/strategies/$delete_id")"
    HTTP_BODY="$(cat "$tmp")"
    if [[ "$code" == "404" ]] && echo "$HTTP_BODY" | jq -e \
      '.code == "STRATEGY_NOT_FOUND"' >/dev/null 2>&1; then
      record_pass "2.3 deleted strategy is hidden"
    else
      record_fail "2.3 deleted strategy hidden" "http=$code"
    fi
  fi

  if [[ -n "$STRATEGY_STATE_FILE" ]]; then
    jq -n \
      --arg email "$email" \
      --arg strategy_id "$strategy_id" \
      --argjson definition "$next_definition" \
      --argjson version_number 2 \
      '{ email: $email, strategy_id: $strategy_id, definition: $definition,
         version_number: $version_number }' >"$STRATEGY_STATE_FILE"
  fi

  rm -f "$tmp"
}

run_sprint_21_restart() {
  log "=== Sprint 2.1 — MySQL restart persistence ==="

  if [[ -z "${DATABASE_URL:-}" ]]; then
    record_skip "2.1 strategy readable after API restart" "DATABASE_URL not set"
    return 0
  fi
  if [[ -z "$STRATEGY_STATE_FILE" || ! -s "$STRATEGY_STATE_FILE" ]]; then
    record_fail "2.1 strategy readable after API restart" "missing strategy state file"
    return 1
  fi

  local email
  local strategy_id
  local definition
  local version_number
  email="$(jq -r '.email' "$STRATEGY_STATE_FILE")"
  strategy_id="$(jq -r '.strategy_id' "$STRATEGY_STATE_FILE")"
  definition="$(jq -c '.definition' "$STRATEGY_STATE_FILE")"
  version_number="$(jq -r '.version_number' "$STRATEGY_STATE_FILE")"
  if [[ -z "$email" || "$email" == "null" ||
        -z "$strategy_id" || "$strategy_id" == "null" ||
        -z "$definition" || "$definition" == "null" ||
        -z "$version_number" || "$version_number" == "null" ]]; then
    record_fail "2.1 strategy readable after API restart" "invalid strategy state"
    return 1
  fi

  http_json POST "/auth/register" "{\"email\":\"$email\",\"display_name\":\"Strategy Restart Smoke\"}"
  if [[ "$HTTP_CODE" != "201" ]]; then
    record_fail "2.1 restart auth register" "http=$HTTP_CODE"
    return 1
  fi

  local strategy_token
  strategy_token="$(echo "$HTTP_BODY" | jq -r '.access_token')"
  local tmp
  tmp="$(mktemp)"
  local code
  code="$(curl -s -o "$tmp" -w "%{http_code}" \
    -H "Authorization: Bearer $strategy_token" \
    "$BASE_URL/strategies/$strategy_id")"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"

  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    --arg id "$strategy_id" --argjson expected "$definition" \
    --argjson version "$version_number" \
    '.id == $id and .version_number == $version and
     .definition == $expected and (.summary | type) == "string"' >/dev/null 2>&1; then
    record_pass "2.3 latest strategy version readable after API restart"
  else
    record_fail "2.1 strategy readable after API restart" "http=$code"
  fi
}

run_sprint_33() {
  log "=== Sprint 3.3 — backtest execution, list, and detail APIs ==="

  local email="backtest-smoke-$(date +%s)-$$@example.com"
  http_json POST "/auth/register" "{\"email\":\"$email\",\"display_name\":\"Backtest Smoke\"}"
  if [[ "$HTTP_CODE" != "201" ]]; then
    record_fail "3.3 auth register" "http=$HTTP_CODE"
    return 1
  fi
  local backtest_token
  backtest_token="$(echo "$HTTP_BODY" | jq -r '.access_token')"
  if [[ -z "$backtest_token" || "$backtest_token" == "null" ]]; then
    record_fail "3.3 auth register" "missing access_token"
    return 1
  fi
  record_pass "3.3 auth register"

  local tmp
  tmp="$(mktemp)"
  local code
  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $backtest_token" \
    -H 'Content-Type: application/json' \
    -d '{"symbol":"AAPL"}' \
    "$BASE_URL/market-data/ingestion/equity")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "201" ]] &&
    echo "$HTTP_BODY" | jq -e '.status == "completed" and .payload.imported_equity_bars >= 40' >/dev/null 2>&1; then
    record_pass "3.3 AAPL bars available"
  else
    record_fail "3.3 AAPL ingestion" "http=$code body=$(echo "$HTTP_BODY" | head -c 200)"
    rm -f "$tmp"
    return 1
  fi

  local definition
  definition='{"indicators":[{"id":"fast","type":"SMA","params":{"period":2},"source":"close"}],"entry":{"logic":"AND","conditions":[{"left":{"price":"close"},"op":"gt","right":{"literal":0}}]},"exit":{"logic":"AND","conditions":[{"left":{"price":"close"},"op":"lt","right":{"literal":0}}]},"risk":{"stop_loss":{"type":"percent","value":2},"take_profit":{"type":"percent","value":500}}}'
  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $backtest_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --argjson definition "$definition" \
      '{name:"Backtest Smoke Strategy",asset_type:"EQUITY",timeframe:"1d",definition:$definition}')" \
    "$BASE_URL/strategies")"
  HTTP_BODY="$(cat "$tmp")"
  local strategy_id
  strategy_id="$(echo "$HTTP_BODY" | jq -r '.id')"
  if [[ "$code" == "201" && -n "$strategy_id" && "$strategy_id" != "null" ]]; then
    record_pass "3.3 create backtest strategy"
  else
    record_fail "3.3 create backtest strategy" "http=$code body=$(echo "$HTTP_BODY" | head -c 200)"
    rm -f "$tmp"
    return 1
  fi

  http_json GET "/market-data/equities/candles?symbol=AAPL&start=2000-01-01&end=2099-12-31&order=desc&limit=40"
  local start_date
  local end_date
  start_date="$(echo "$HTTP_BODY" | jq -r '.[-1].date')"
  end_date="$(echo "$HTTP_BODY" | jq -r '.[0].date')"
  if [[ "$HTTP_CODE" != "200" || "$start_date" == "null" || "$end_date" == "null" ]]; then
    record_fail "3.3 resolve candle range" "http=$HTTP_CODE"
    rm -f "$tmp"
    return 1
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $backtest_token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --arg strategy "$strategy_id" --arg start "$start_date" --arg end "$end_date" \
      '{strategy_id:$strategy,symbol:"AAPL",timeframe:"1d",start_date:$start,end_date:$end,initial_equity:10000}')" \
    "$BASE_URL/backtests")"
  HTTP_BODY="$(cat "$tmp")"
  local run_id
  run_id="$(echo "$HTTP_BODY" | jq -r '.run.id')"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    --arg strategy "$strategy_id" \
    '.run.strategy_id == $strategy and .run.status == "completed" and
     .run.symbol == "AAPL" and (.run.job_id | type) == "string" and
     (.run.diagnostics.bars_processed >= 2) and
     (.results.final_equity | type) == "string" and
     (.results.num_trades | type) == "number"' >/dev/null 2>&1; then
    record_pass "3.3 synchronous backtest execution"
  else
    record_fail "3.3 synchronous backtest execution" "http=$code body=$(echo "$HTTP_BODY" | head -c 300)"
    rm -f "$tmp"
    return 1
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" \
    -H "Authorization: Bearer $backtest_token" \
    "$BASE_URL/backtests?symbol=AAPL&status=completed&limit=1&offset=0")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    --arg run "$run_id" \
    '.items[0].id == $run and .limit == 1 and .offset == 0 and
     (.items[0] | has("trades") | not) and
     (.items[0] | has("equity_curve") | not)' >/dev/null 2>&1; then
    record_pass "3.3 owner-scoped backtest list"
  else
    record_fail "3.3 backtest list" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" \
    -H "Authorization: Bearer $backtest_token" \
    "$BASE_URL/backtests/$run_id?trades_limit=1&trades_offset=0")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    --arg run "$run_id" \
    '.run.id == $run and (.equity_curve | length) >= 2 and
     .trades_page.limit == 1 and .trades_page.offset == 0 and
     (.trades | length) <= 1 and
     (all(.trades[]; (.id | type) == "number"))' >/dev/null 2>&1; then
    record_pass "3.3 paginated backtest detail"
  else
    record_fail "3.3 backtest detail" "http=$code"
  fi

  code="$(curl -s -o "$tmp" -w "%{http_code}" "$BASE_URL/backtests")"
  HTTP_BODY="$(cat "$tmp")"
  if [[ "$code" == "401" ]] && echo "$HTTP_BODY" | jq -e '.code == "UNAUTHORIZED"' >/dev/null 2>&1; then
    record_pass "3.3 unauthenticated backtest list rejected"
  else
    record_fail "3.3 unauthenticated backtest list" "http=$code"
  fi
  rm -f "$tmp"
}

run_sprint_4() {
  log "=== Sprint 4 — paper accounts, orders, executions, positions, and valuation ==="

  local email="trading-smoke-$(date +%s)-$$@example.com"
  http_json POST "/auth/register" "{\"email\":\"$email\",\"display_name\":\"Trading Smoke\"}"
  if [[ "$HTTP_CODE" != "201" ]]; then
    record_fail "4 auth register" "http=$HTTP_CODE"
    return 1
  fi
  local trading_token
  trading_token="$(echo "$HTTP_BODY" | jq -r '.access_token')"
  if [[ -z "$trading_token" || "$trading_token" == "null" ]]; then
    record_fail "4 auth register" "missing access_token"
    return 1
  fi
  record_pass "4 auth register + paper-account provisioning"

  http_auth_json POST "/market-data/ingestion/equity" "$trading_token" '{"symbol":"AAPL"}'
  if [[ "$HTTP_CODE" == "201" ]] &&
    echo "$HTTP_BODY" | jq -e '.status == "completed"' >/dev/null 2>&1; then
    record_pass "4 current AAPL close available"
  else
    record_fail "4 AAPL ingestion prerequisite" "http=$HTTP_CODE"
    return 1
  fi

  http_auth_json GET "/paper-account" "$trading_token"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.base_currency == "USD" and .starting_balance == "100000.00" and
     .cash_balance == "100000.00"' >/dev/null 2>&1; then
    record_pass "4.1 fixed-scale paper account"
  else
    record_fail "4.1 GET paper account" "http=$HTTP_CODE body=$(echo "$HTTP_BODY" | head -c 250)"
  fi

  local client_id="smoke-buy-$(date +%s)-$$"
  local buy_body
  buy_body="$(jq -cn --arg client "$client_id" \
    '{symbol:"AAPL",side:"BUY",quantity:"1",client_order_id:$client}')"
  http_auth_json POST "/trading/orders" "$trading_token" "$buy_body"
  local order_id
  order_id="$(echo "$HTTP_BODY" | jq -r '.order.id')"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.order.status == "FILLED" and .order.symbol == "AAPL" and
     .order.quantity == "1.00000000" and
     (.order.avg_fill_price | type) == "string"' >/dev/null 2>&1; then
    record_pass "4.2 market BUY fills"
  else
    record_fail "4.2 market BUY" "http=$HTTP_CODE body=$(echo "$HTTP_BODY" | head -c 250)"
    return 1
  fi

  http_auth_json POST "/trading/orders" "$trading_token" "$buy_body"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    --arg id "$order_id" '.order.id == $id and .order.status == "FILLED"' >/dev/null 2>&1; then
    record_pass "4.2 idempotent replay returns original order"
  else
    record_fail "4.2 idempotent replay" "http=$HTTP_CODE"
  fi

  http_auth_json GET "/paper-account" "$trading_token"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '(.cash_balance | tonumber) < (.starting_balance | tonumber)' >/dev/null 2>&1; then
    record_pass "4.1 filled BUY debits cash once"
  else
    record_fail "4.1 BUY cash balance" "http=$HTTP_CODE"
  fi

  http_auth_json GET "/trading/positions" "$trading_token"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.positions == [{symbol:"AAPL",quantity:"1.00000000",avg_cost:.positions[0].avg_cost}] and
     (.positions[0].avg_cost | type) == "string"' >/dev/null 2>&1; then
    record_pass "4.3 current positions"
  else
    record_fail "4.3 GET positions" "http=$HTTP_CODE"
  fi

  http_auth_json GET "/trading/portfolio-summary" "$trading_token"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.total_equity == "100000.00" and .unrealized_pnl_total == "0.00"' >/dev/null 2>&1; then
    record_pass "4.3 mark-to-market portfolio summary"
  else
    record_fail "4.3 portfolio summary" "http=$HTTP_CODE body=$(echo "$HTTP_BODY" | head -c 250)"
  fi

  http_auth_json GET "/trading/orders?status=FILLED&symbol=AAPL&limit=1&offset=0" "$trading_token"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    --arg id "$order_id" '.orders[0].id == $id and .limit == 1 and .offset == 0' >/dev/null 2>&1; then
    record_pass "4.3 filtered order history"
  else
    record_fail "4.3 order history" "http=$HTTP_CODE"
  fi

  http_auth_json GET "/trading/executions?symbol=AAPL&limit=10&offset=0" "$trading_token"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.executions | length == 1 and .[0].symbol == "AAPL" and
     (.[0].notional | type) == "string"' >/dev/null 2>&1; then
    record_pass "4.3 execution history has one idempotent fill"
  else
    record_fail "4.3 execution history" "http=$HTTP_CODE"
  fi

  http_auth_json POST "/trading/orders" "$trading_token" \
    "{\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":\"9999\",\"client_order_id\":\"$client_id-risk\"}"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.order.status == "REJECTED" and .order.reject_reason == "MAX_ORDER_NOTIONAL"' >/dev/null 2>&1; then
    record_pass "4.2 persisted risk rejection"
  else
    record_fail "4.2 risk rejection" "http=$HTTP_CODE"
  fi

  http_auth_json POST "/trading/orders" "$trading_token" \
    "$(jq -cn --arg client "$client_id" \
      '{symbol:"AAPL",side:"BUY",quantity:"2",client_order_id:$client}')"
  if [[ "$HTTP_CODE" == "409" ]] && echo "$HTTP_BODY" | jq -e \
    '.code == "CONFLICT"' >/dev/null 2>&1; then
    record_pass "4.2 semantic idempotency conflict"
  else
    record_fail "4.2 idempotency conflict" "http=$HTTP_CODE"
  fi

  http_auth_json POST "/trading/orders" "$trading_token" \
    '{"symbol":"AAPL","side":"SELL","quantity":"1"}'
  http_auth_json GET "/trading/positions" "$trading_token"
  if [[ "$HTTP_CODE" == "200" ]] && echo "$HTTP_BODY" | jq -e \
    '.positions == []' >/dev/null 2>&1; then
    record_pass "4.1 partial/full sell position lifecycle"
  else
    record_fail "4.1 close position" "http=$HTTP_CODE"
  fi

  http_json GET "/paper-account"
  if [[ "$HTTP_CODE" == "401" ]] && echo "$HTTP_BODY" | jq -e \
    '.code == "UNAUTHORIZED"' >/dev/null 2>&1; then
    record_pass "4 protected routes reject missing auth"
  else
    record_fail "4 unauthenticated paper account" "http=$HTTP_CODE"
  fi

  http_auth_json POST "/trading/orders" "$trading_token" \
    '{"symbol":"AAPL","side":"BUY","quantity":1}'
  if [[ "$HTTP_CODE" == "400" ]] && echo "$HTTP_BODY" | jq -e \
    '.code == "VALIDATION_ERROR"' >/dev/null 2>&1; then
    record_pass "4 strict decimal-string validation"
  else
    record_fail "4 invalid numeric quantity" "http=$HTTP_CODE"
  fi
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
  http_json GET "/market-data/equities/candles?symbol=AAPL&start=2000-01-01&end=2099-12-31"
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
    2.1|2.2|2.3) run_sprint_21 ;;
    3.3) run_sprint_33 ;;
    4|4.1|4.2|4.3) run_sprint_4 ;;
    2.1-restart|2.3-restart) run_sprint_21_restart ;;
    all)
      if [[ -n "${DATABASE_URL:-}" ]]; then
        # Make DB verification self-contained on both empty and previously used
        # databases. Rolling seed windows upsert but intentionally do not delete
        # older bars, so DB count assertions use the seed size as a minimum.
        run_sprint_13
        run_db_persisted_candles
        run_sprint_12
      else
        run_sprint_12
        run_sprint_13
        run_db_persisted_candles
      fi
      run_sprint_21
      run_sprint_33
      run_sprint_4
      ;;
    *) echo "Invalid --sprint: $SPRINT_SCOPE (use 1.2, 1.3, 2.1, 2.2, 2.3, 3.3, 4, or all)" >&2; exit 1 ;;
  esac

  log "=== Summary: $PASS passed, $FAIL failed, $SKIP skipped ==="
  if [[ "$FAIL" -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
