#!/usr/bin/env bash
# End-to-end Sprint 1.2–3.4 verification. Sprint 3.1 is exercised by the
# unit/coverage gates, Sprint 3.2 has an isolated MySQL persistence round trip,
# Sprint 3.3 is covered by e2e + HTTP smoke, and Sprint 3.4 adds web gates.
# Usage:
#   ./scripts/sprint-delivery-verify.sh verify          # gates + smoke only
#   KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify  # smoke + MySQL checks (reads apps/api/.env)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
# shellcheck source=lib/load-api-env.sh
source "$ROOT/scripts/lib/load-api-env.sh"
LOG_DIR="$ROOT/logs/smoke"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
WORK_LOG="$LOG_DIR/verify-$TIMESTAMP.log"
API_PID=""
STRATEGY_STATE_FILE=""
MODE="${1:-verify}"

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%H:%M:%S')] $*" | tee -a "$WORK_LOG"
}

stop_api() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    log "Stopping API (pid $API_PID)"
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  API_PID=""
}

cleanup() {
  stop_api
  if [[ -n "$STRATEGY_STATE_FILE" ]]; then
    rm -f "$STRATEGY_STATE_FILE"
  fi
}
trap cleanup EXIT

run_gate() {
  local name="$1"
  shift
  log "GATE: $name — $*"
  if (cd "$ROOT" && "$@") >>"$WORK_LOG" 2>&1; then
    log "GATE PASS: $name"
    return 0
  fi
  log "GATE FAIL: $name (see $WORK_LOG)"
  return 1
}

start_api() {
  stop_api
  if lsof -ti:4000 >/dev/null 2>&1; then
    log "Port 4000 is already in use; stop that process before verification"
    return 1
  fi

  log "Building API..."
  npm --prefix "$API_DIR" run build >>"$WORK_LOG" 2>&1

  if [[ -n "${KEEP_DATABASE_URL:-}" ]]; then
    load_database_url_from_api_env "$API_DIR"
  fi

  if [[ -n "${DATABASE_URL:-}" ]]; then
    log "Starting API on port 4000 (MySQL mode, INGESTION_SCHEDULER_ENABLED=false)..."
  else
    log "Starting API on port 4000 (seed mode, INGESTION_SCHEDULER_ENABLED=false)..."
  fi
  (
    cd "$API_DIR"
    export NODE_ENV=development
    export INGESTION_SCHEDULER_ENABLED=false
    # Blank DATABASE_URL for seed-mode smoke unless explicitly requested.
    # Use export DATABASE_URL= (not unset) so load-env.ts does not repopulate from .env.
    if [[ -z "${KEEP_DATABASE_URL:-}" ]]; then
      export DATABASE_URL=
    elif [[ -n "${DATABASE_URL:-}" ]]; then
      export DATABASE_URL
    fi
    exec node dist/src/main.js
  ) >>"$WORK_LOG" 2>&1 &
  API_PID=$!
  log "API pid=$API_PID"
}

run_smoke() {
  local scope="${1:-all}"
  local args=(--sprint "$scope" --base-url http://localhost:4000/api)
  if [[ -n "$STRATEGY_STATE_FILE" ]]; then
    args+=(--strategy-state-file "$STRATEGY_STATE_FILE")
  fi
  log "Running smoke tests (scope=$scope)..."
  if "$ROOT/scripts/smoke-test-api.sh" "${args[@]}"; then
    log "Smoke PASS ($scope)"
    return 0
  fi
  log "Smoke FAIL ($scope) — see latest log in $LOG_DIR"
  return 1
}

verify_all() {
  log "=== Phase: quality gates ==="
  run_gate "build" npm --prefix apps/api run build
  run_gate "lint" npm --prefix apps/api run lint
  run_gate "test" npm --prefix apps/api run test
  run_gate "test:cov" npm --prefix apps/api run test:cov
  run_gate "test:e2e" env NODE_ENV=test DATABASE_URL= npm --prefix apps/api run test:e2e
  run_gate "web:build" npm run web:build
  run_gate "web:lint" npm run web:lint
  run_gate "web:test" npm run web:test
  run_gate "web:audit" npm --prefix apps/web audit

  log "=== Phase: smoke tests ==="
  if [[ -n "${KEEP_DATABASE_URL:-}" ]]; then
    load_database_url_from_api_env "$API_DIR"
    if [[ -n "${DATABASE_URL:-}" ]]; then
      log "Smoke DB checks enabled (DATABASE_URL loaded for persistence test)"
      run_gate "db:deploy" npm --prefix apps/api run db:deploy
      run_gate "backtest:persistence:mysql" env \
        NODE_ENV=development \
        INGESTION_SCHEDULER_ENABLED=false \
        LOG_LEVEL=silent \
        npm --prefix apps/api run test:mysql:backtest
      STRATEGY_STATE_FILE="$(mktemp)"
    else
      log "KEEP_DATABASE_URL=1 but DATABASE_URL not found — persistence test will skip"
    fi
  else
    # Clear in this shell too so smoke-test-api.sh does not inherit a URL and
    # mis-report MySQL persistence against a seed-mode API process.
    export DATABASE_URL=
    log "Smoke seed mode (DATABASE_URL cleared for API start even when apps/api/.env defines it)"
  fi
  start_api
  run_smoke all
  if [[ -n "${DATABASE_URL:-}" ]]; then
    log "Restarting API for persisted strategy ownership verification"
    start_api
    run_smoke 2.3-restart
  fi
}

case "$MODE" in
  verify) verify_all ;;
  *)
    echo "Usage: $0 verify" >&2
    exit 1
    ;;
esac
