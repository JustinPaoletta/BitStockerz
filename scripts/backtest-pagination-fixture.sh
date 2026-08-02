#!/usr/bin/env bash
# Create or remove the isolated 501-trade fixture used by the PR #9 UI gate.
set -euo pipefail

readonly CONTAINER_NAME="${BITSTOCKERZ_DB_CONTAINER:-bitstockerz-db}"
readonly MYSQL_DATABASE="${BITSTOCKERZ_MYSQL_DATABASE:-bitstockerz}"
readonly MYSQL_USER="${BITSTOCKERZ_MYSQL_USER:-bitstockerz}"
readonly MYSQL_PASSWORD="${BITSTOCKERZ_MYSQL_PASSWORD:-devpassword}"
readonly FIXTURE_RUN_ID="${BITSTOCKERZ_PAGINATION_RUN_ID:-50100000-0000-4000-8000-000000000009}"

usage() {
  echo "Usage: $0 create <completed-source-run-id> | cleanup" >&2
}

is_uuid() {
  [[ "$1" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]]
}

mysql_query() {
  docker exec -i "$CONTAINER_NAME" mysql \
    --batch \
    --raw \
    --skip-column-names \
    -u"$MYSQL_USER" \
    -p"$MYSQL_PASSWORD" \
    "$MYSQL_DATABASE" \
    "$@"
}

if ! is_uuid "$FIXTURE_RUN_ID"; then
  echo "BITSTOCKERZ_PAGINATION_RUN_ID must be a UUID." >&2
  exit 1
fi

case "${1:-}" in
  create)
    readonly SOURCE_RUN_ID="${2:-}"
    if ! is_uuid "$SOURCE_RUN_ID"; then
      usage
      exit 1
    fi

    EXISTING_COUNT=$(mysql_query --execute="SELECT COUNT(*) FROM backtest_runs WHERE id = '$FIXTURE_RUN_ID';")
    if [[ "$EXISTING_COUNT" != "0" ]]; then
      echo "Fixture $FIXTURE_RUN_ID already exists; run '$0 cleanup' first." >&2
      exit 1
    fi

    SOURCE_READY=$(mysql_query --execute="
      SELECT COUNT(*)
      FROM backtest_runs AS run
      INNER JOIN backtest_results AS result ON result.backtest_run_id = run.id
      WHERE run.id = '$SOURCE_RUN_ID' AND run.status = 'completed';
    ")
    if [[ "$SOURCE_READY" != "1" ]]; then
      echo "Source run $SOURCE_RUN_ID must exist, be completed, and have results." >&2
      exit 1
    fi

    mysql_query --execute="
      START TRANSACTION;

      INSERT INTO backtest_runs (
        id, user_id, strategy_id, strategy_version_id, symbol_id, timeframe,
        start_date, end_date, initial_equity, status, job_id, error_message,
        created_at, updated_at, started_at, finished_at
      )
      SELECT
        '$FIXTURE_RUN_ID', user_id, strategy_id, strategy_version_id, symbol_id,
        timeframe, start_date, end_date, initial_equity, 'completed', NULL, NULL,
        NOW(3), NOW(3), NOW(3), NOW(3)
      FROM backtest_runs
      WHERE id = '$SOURCE_RUN_ID';

      INSERT INTO backtest_results (
        backtest_run_id, final_equity, total_return_pct, max_drawdown_pct,
        win_rate_pct, num_trades, avg_win_pct, avg_loss_pct, sharpe_ratio
      )
      SELECT
        '$FIXTURE_RUN_ID', final_equity, total_return_pct, max_drawdown_pct,
        win_rate_pct, 501, avg_win_pct, avg_loss_pct, sharpe_ratio
      FROM backtest_results
      WHERE backtest_run_id = '$SOURCE_RUN_ID';

      INSERT INTO backtest_equity_points (backtest_run_id, ts, equity)
      SELECT '$FIXTURE_RUN_ID', ts, equity
      FROM backtest_equity_points
      WHERE backtest_run_id = '$SOURCE_RUN_ID';

      INSERT INTO backtest_trades (
        backtest_run_id, symbol_id, entry_time, exit_time, side, entry_price,
        exit_price, quantity, pnl_abs, pnl_pct
      )
      WITH RECURSIVE sequence (trade_number) AS (
        SELECT 1
        UNION ALL
        SELECT trade_number + 1 FROM sequence WHERE trade_number < 501
      )
      SELECT
        '$FIXTURE_RUN_ID', run.symbol_id,
        DATE_ADD(run.start_date, INTERVAL sequence.trade_number MINUTE),
        DATE_ADD(
          DATE_ADD(run.start_date, INTERVAL sequence.trade_number MINUTE),
          INTERVAL 30 SECOND
        ),
        'long', 100.00000000, 100.01000000, 1.00000000, 0.01000000, 0.0100
      FROM backtest_runs AS run
      CROSS JOIN sequence
      WHERE run.id = '$FIXTURE_RUN_ID';

      COMMIT;
    "

    FIXTURE_FACTS=$(mysql_query --execute="
      SELECT run.status, result.num_trades, COUNT(trade.id), COUNT(DISTINCT trade.id)
      FROM backtest_runs AS run
      INNER JOIN backtest_results AS result ON result.backtest_run_id = run.id
      LEFT JOIN backtest_trades AS trade ON trade.backtest_run_id = run.id
      WHERE run.id = '$FIXTURE_RUN_ID'
      GROUP BY run.id, run.status, result.num_trades;
    ")
    IFS=$'\t' read -r STATUS RESULT_TRADES STORED_TRADES UNIQUE_TRADES <<< "$FIXTURE_FACTS"
    if [[ "$STATUS" != "completed" || "$RESULT_TRADES" != "501" || "$STORED_TRADES" != "501" || "$UNIQUE_TRADES" != "501" ]]; then
      echo "Fixture verification failed: $FIXTURE_FACTS" >&2
      exit 1
    fi

    echo "Pagination fixture ready: $FIXTURE_RUN_ID (501 unique trades)."
    ;;
  cleanup)
    DELETED_COUNT=$(mysql_query --execute="
      DELETE FROM backtest_runs WHERE id = '$FIXTURE_RUN_ID';
      SELECT ROW_COUNT();
    ")
    echo "Pagination fixture cleanup complete: $DELETED_COUNT run(s) removed."
    ;;
  *)
    usage
    exit 1
    ;;
esac
