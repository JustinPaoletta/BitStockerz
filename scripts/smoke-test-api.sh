#!/usr/bin/env bash
# BitStockerz API smoke tests — logs pass/fail per scenario.
# Usage: ./scripts/smoke-test-api.sh [--sprint 1.2|1.3|2.1|2.2|2.3|all] [--base-url URL]
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
      ;;
    *) echo "Invalid --sprint: $SPRINT_SCOPE (use 1.2, 1.3, 2.1, 2.2, 2.3, or all)" >&2; exit 1 ;;
  esac

  log "=== Summary: $PASS passed, $FAIL failed, $SKIP skipped ==="
  if [[ "$FAIL" -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
