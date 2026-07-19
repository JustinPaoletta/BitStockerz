#!/usr/bin/env bash
# End-to-end Sprint 1.2/1.3 verification and optional PR workflow.
# Usage:
#   ./scripts/sprint-delivery-verify.sh verify          # gates + smoke only
#   KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify  # smoke + MySQL checks (reads apps/api/.env)
#   ./scripts/sprint-delivery-verify.sh workflow        # verify + commit/push + merge PRs
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
# shellcheck source=lib/load-api-env.sh
source "$ROOT/scripts/lib/load-api-env.sh"
LOG_DIR="$ROOT/logs/smoke"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
WORK_LOG="$LOG_DIR/workflow-$TIMESTAMP.log"
API_PID=""
MODE="${1:-verify}"

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%H:%M:%S')] $*" | tee -a "$WORK_LOG"
}

cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    log "Stopping API (pid $API_PID)"
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
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
  if lsof -ti:4000 >/dev/null 2>&1; then
    log "Port 4000 in use — stopping existing process"
    lsof -ti:4000 | xargs kill -9 2>/dev/null || true
    sleep 1
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
    npm run start
  ) >>"$WORK_LOG" 2>&1 &
  API_PID=$!
  log "API pid=$API_PID"
}

run_smoke() {
  local scope="${1:-all}"
  log "Running smoke tests (scope=$scope)..."
  if "$ROOT/scripts/smoke-test-api.sh" --sprint "$scope" --base-url http://localhost:4000/api; then
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

  log "=== Phase: smoke tests ==="
  if [[ -n "${KEEP_DATABASE_URL:-}" ]]; then
    load_database_url_from_api_env "$API_DIR"
    if [[ -n "${DATABASE_URL:-}" ]]; then
      log "Smoke DB checks enabled (DATABASE_URL loaded for persistence test)"
    else
      log "KEEP_DATABASE_URL=1 but DATABASE_URL not found — persistence test will skip"
    fi
  else
    log "Smoke seed mode (DATABASE_URL cleared for API start even when apps/api/.env defines it)"
  fi
  start_api
  run_smoke all
}

commit_skill_updates() {
  cd "$ROOT"
  if git diff --quiet .cursor/skills/sprint-delivery/ 2>/dev/null && \
     git diff --cached --quiet .cursor/skills/sprint-delivery/ 2>/dev/null; then
    log "No sprint-delivery skill changes to commit"
    return 0
  fi
  git add .cursor/skills/sprint-delivery/
  if [[ -f scripts/smoke-test-api.sh ]]; then
    git add scripts/smoke-test-api.sh scripts/sprint-delivery-verify.sh
  fi
  if [[ -f apps/api/.env.example ]]; then
    git add apps/api/.env.example
  fi
  git commit -m "$(cat <<'EOF'
chore: add sprint smoke scripts and dev-input retrospectives

EOF
)"
  log "Committed skill + script updates"
}

push_branch() {
  local branch
  branch="$(git branch --show-current)"
  log "Pushing $branch..."
  git push origin "$branch"
}

merge_pr_if_green() {
  local pr="$1"
  local title
  title="$(gh pr view "$pr" --json title -q .title 2>/dev/null || echo "PR $pr")"
  log "Attempting merge PR #$pr ($title)..."
  if gh pr merge "$pr" --merge --delete-branch=false >>"$WORK_LOG" 2>&1; then
    log "Merged PR #$pr"
    return 0
  fi
  log "Could not merge PR #$pr automatically — merge manually on GitHub"
  return 1
}

rebase_onto_main() {
  local branch
  branch="$(git branch --show-current)"
  log "Fetching main and rebasing $branch..."
  git fetch origin main
  git rebase origin/main
  git push --force-with-lease origin "$branch"
  log "Rebased $branch onto origin/main (force-with-lease push)"
  gh pr edit 6 --base main >>"$WORK_LOG" 2>&1 || log "Note: retarget PR #6 base to main if needed"
}

workflow() {
  verify_all
  commit_skill_updates
  push_branch

  log "=== Phase: merge PR #5 (Sprint 1.2) ==="
  if merge_pr_if_green 5; then
    log "=== Phase: rebase Sprint 1.3 onto main ==="
    rebase_onto_main
    log "=== Phase: merge PR #6 (Sprint 1.3) ==="
    merge_pr_if_green 6 || true
  else
    log "Skipping PR #6 merge until PR #5 is merged"
  fi

  log "Workflow complete — log: $WORK_LOG"
}

case "$MODE" in
  verify) verify_all ;;
  workflow) workflow ;;
  *)
    echo "Usage: $0 [verify|workflow]" >&2
    exit 1
    ;;
esac
