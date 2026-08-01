# PR #9 Pre-Merge Manual Checklist

This is the single required pre-merge test document for
[PR #9](https://github.com/JustinPaoletta/BitStockerz/pull/9). It covers the
human-visible behavior added by Sprints 2.1–2.3 and 3.3–3.4, plus the
automated-only Sprint 3.1 engine, Sprint 3.2 internal persistence surface, and
the generated OpenAPI/Swagger follow-up. It is the only manual test document
required for this PR. General unit, coverage, e2e, seed-smoke, and MySQL-smoke
gates are not duplicated except for the focused commands needed to sign off
surfaces that have no separate HTTP or UI workflow.

**Execution record:** All 34 checks below passed on 2026-08-01. The Sprint
2.1–3.4 workflow record culminated at pagination-gate commit `0163316`; the
generated-contract gate and full API unit/e2e/build/lint/coverage regression
passed against OpenAPI follow-up commit `7204830`, using the live API and a real
Chromium browser. The checked boxes are the PR #9 acceptance record; rerun the
applicable commands if the implementation changes.

Run every command from the repository root. Prerequisites are Node.js
`24.11.1`, npm, `curl`, `jq`, and Docker Desktop. Use two terminals and keep
Terminal B open through the restart check.

## 1. Start the API in MySQL mode

In **Terminal A**:

```bash
./scripts/docker-mysql.sh start
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
# Confirm apps/api/.env contains the DATABASE_URL printed above.
npm --prefix apps/api run db:deploy
INGESTION_SCHEDULER_ENABLED=false npm --prefix apps/api run start:dev
```

In **Terminal B**:

```bash
BASE_URL=http://localhost:4000/api
curl -s "$BASE_URL/health/ready" | jq -e '.checks.database.status == "up"'
```

Expected: `true`. Stop if the database is not `up`; later persistence checks
would otherwise prove only in-memory behavior.

- [x] API starts in MySQL mode and readiness reports the database `up`.

## 2. Verify the public indicator catalog

Do not send a bearer token:

```bash
curl -s "$BASE_URL/strategies/indicators" \
  -o /tmp/bitstockerz-indicators.json

jq -e '
  (.indicators | map(.key)) == ["SMA", "EMA", "RSI"] and
  (.indicators[0] | keys | sort) ==
    ["default_source", "description", "display_name", "key", "params", "sources"] and
  .indicators[0].params[0] ==
    {"name":"period","type":"integer","min":2,"max":200,"default":20} and
  .indicators[1].params[0].max == 200 and
  .indicators[2].params[0] ==
    {"name":"period","type":"integer","min":2,"max":100,"default":14} and
  .indicators[2].sources == ["close"] and
  (.indicators | all(.default_source == "close"))
' /tmp/bitstockerz-indicators.json
```

Expected: `true`.

- [x] Catalog is public and exposes the exact SMA/EMA/RSI contract.

## 3. Register an owner and create a canonical strategy

```bash
OWNER_EMAIL="strategy-owner-$(date +%s)@example.com"
OWNER_TOKEN=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OWNER_EMAIL\",\"display_name\":\"PR 9 Owner\"}" \
  | jq -r '.access_token')

DEFINITION=$(jq -cn '{
  indicators: [
    {id:"sma_fast",type:"SMA",params:{period:10},source:"close"},
    {id:"sma_slow",type:"EMA",params:{period:30},source:"close"},
    {id:"rsi",type:"RSI",params:{period:14},source:"close"}
  ],
  entry: {
    logic:"AND",
    conditions:[
      {left:{indicator:"sma_fast"},op:"crosses_above",right:{indicator:"sma_slow"}},
      {left:{indicator:"rsi"},op:"lt",right:{literal:70}}
    ]
  },
  exit: {
    logic:"AND",
    conditions:[
      {left:{indicator:"sma_fast"},op:"crosses_below",right:{indicator:"sma_slow"}}
    ]
  },
  risk: {
    stop_loss:{type:"percent",value:2},
    take_profit:{type:"percent",value:500}
  }
}')

EXPECTED_SUMMARY='Buy when SMA(10) crosses above EMA(30) AND RSI(14) < 70. Exit when SMA(10) crosses below EMA(30). Stop loss 2%. Take profit 500%.'

CREATE_BODY=$(jq -cn --argjson definition "$DEFINITION" '{
  name:"PR 9 Manual Strategy",
  description:"Canonical Sprint 2.3 definition with the 500% TP ceiling",
  asset_type:"EQUITY",
  timeframe:"1d",
  definition:$definition
}')

CREATE_CODE=$(curl -s -o /tmp/bitstockerz-strategy-create.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$CREATE_BODY")
STRATEGY_ID=$(jq -r '.id' /tmp/bitstockerz-strategy-create.json)

test "$CREATE_CODE" = 201
jq -e --argjson expected "$DEFINITION" --arg summary "$EXPECTED_SUMMARY" '
  .name == "PR 9 Manual Strategy" and
  .symbol_scope == "SINGLE" and
  .is_active == true and
  .version_number == 1 and
  .definition == $expected and
  .summary == $summary
' /tmp/bitstockerz-strategy-create.json
```

Expected: both assertions pass. This proves that exactly `500` is accepted and
that the summary is deterministic.

- [x] Create returns `201`, immutable version 1, exact JSON, and exact summary.
- [x] A take-profit value of exactly `500%` is accepted and displayed.

## 4. Verify dry-run validation

### Valid inline definition and persisted strategy

```bash
VALIDATE_BODY=$(jq -cn --argjson definition "$DEFINITION" \
  '{definition:$definition}')
VALIDATE_CODE=$(curl -s -o /tmp/bitstockerz-validate-valid.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies/validate" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$VALIDATE_BODY")

test "$VALIDATE_CODE" = 200
jq -e --arg summary "$EXPECTED_SUMMARY" '
  .is_valid == true and .errors == [] and .summary == $summary
' /tmp/bitstockerz-validate-valid.json

PERSISTED_VALIDATE_CODE=$(curl -s \
  -o /tmp/bitstockerz-validate-persisted.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies/validate" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"strategy_id\":\"$STRATEGY_ID\"}")

test "$PERSISTED_VALIDATE_CODE" = 200
jq -e '.is_valid == true and .errors == [] and (.summary | type) == "string"' \
  /tmp/bitstockerz-validate-persisted.json
```

### Invalid definition and XOR body

```bash
BAD_OPERATOR=$(echo "$DEFINITION" |
  jq -c '.entry.conditions[0].op = "unknown"')
BAD_OPERATOR_BODY=$(jq -cn --argjson definition "$BAD_OPERATOR" \
  '{definition:$definition}')
BAD_OPERATOR_CODE=$(curl -s \
  -o /tmp/bitstockerz-validate-invalid.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies/validate" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BAD_OPERATOR_BODY")

test "$BAD_OPERATOR_CODE" = 200
jq -e '
  .is_valid == false and
  .summary == null and
  .errors[0].path == "entry.conditions[0].op" and
  .errors[0].code == "UNKNOWN_OPERATOR"
' /tmp/bitstockerz-validate-invalid.json

XOR_CODE=$(curl -s -o /tmp/bitstockerz-validate-xor.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies/validate" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}')

test "$XOR_CODE" = 400
jq -e '.code == "STRATEGY_VALIDATION_ERROR"' \
  /tmp/bitstockerz-validate-xor.json
```

Expected: validation returns `200` for both valid and invalid definitions and
does not create a strategy. Only an invalid request envelope returns `400`.

- [x] Inline and persisted validation return the same deterministic summary.
- [x] Invalid rules return structured errors and `summary: null` without writes.
- [x] Both/neither validation inputs return `STRATEGY_VALIDATION_ERROR`.

## 5. Verify list shape and default paging

```bash
LIST_CODE=$(curl -s -o /tmp/bitstockerz-strategy-list.json \
  -w '%{http_code}' "$BASE_URL/strategies" \
  -H "Authorization: Bearer $OWNER_TOKEN")

test "$LIST_CODE" = 200
jq -e --arg id "$STRATEGY_ID" '
  .limit == 50 and .offset == 0 and .has_more == false and
  (.items | length) == 1 and
  .items[0].id == $id and
  (.items[0] | keys | sort) ==
    ["asset_type","created_at","id","is_active","name","timeframe","updated_at","version_number"] and
  (.items[0] | has("definition") | not)
' /tmp/bitstockerz-strategy-list.json
```

Expected: `true`; list items do not contain the potentially large definition.

- [x] Owner list uses the documented envelope and lightweight item shape.

## 6. Verify metadata updates and immutable definition versions

### Metadata-only update

```bash
METADATA_CODE=$(curl -s -o /tmp/bitstockerz-update-metadata.json \
  -w '%{http_code}' -X PUT "$BASE_URL/strategies/$STRATEGY_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"  PR 9 Renamed Strategy  ","description":null,"asset_type":"CRYPTO","timeframe":"1h"}')

test "$METADATA_CODE" = 200
jq -e '
  .name == "PR 9 Renamed Strategy" and
  .description == null and
  .asset_type == "CRYPTO" and
  .timeframe == "1h" and
  .version_number == 1
' /tmp/bitstockerz-update-metadata.json
```

### Definition updates

```bash
NEW_DEFINITION=$(echo "$DEFINITION" |
  jq -c '.indicators[0].params.period = 11')
NEW_SUMMARY='Buy when SMA(11) crosses above EMA(30) AND RSI(14) < 70. Exit when SMA(11) crosses below EMA(30). Stop loss 2%. Take profit 500%.'
NEW_DEFINITION_BODY=$(jq -cn --argjson definition "$NEW_DEFINITION" \
  '{definition:$definition}')

VERSION_2_CODE=$(curl -s -o /tmp/bitstockerz-update-v2.json \
  -w '%{http_code}' -X PUT "$BASE_URL/strategies/$STRATEGY_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$NEW_DEFINITION_BODY")

VERSION_3_CODE=$(curl -s -o /tmp/bitstockerz-update-v3.json \
  -w '%{http_code}' -X PUT "$BASE_URL/strategies/$STRATEGY_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$NEW_DEFINITION_BODY")

test "$VERSION_2_CODE" = 200
test "$VERSION_3_CODE" = 200
jq -e --argjson expected "$NEW_DEFINITION" --arg summary "$NEW_SUMMARY" '
  .version_number == 2 and .definition == $expected and .summary == $summary
' /tmp/bitstockerz-update-v2.json
jq -e '.version_number == 3' /tmp/bitstockerz-update-v3.json
```

The second request intentionally repeats an identical definition. Its version
must still increment because presence of `definition` is the versioning signal.

### Historical and missing version reads

```bash
HISTORY_CODE=$(curl -s -o /tmp/bitstockerz-history-v1.json \
  -w '%{http_code}' "$BASE_URL/strategies/$STRATEGY_ID?version=1" \
  -H "Authorization: Bearer $OWNER_TOKEN")

test "$HISTORY_CODE" = 200
jq -e --argjson expected "$DEFINITION" '
  .name == "PR 9 Renamed Strategy" and
  .version_number == 1 and
  .definition == $expected and
  .is_latest == false and
  (.version_created_at | type) == "string"
' /tmp/bitstockerz-history-v1.json

MISSING_VERSION_CODE=$(curl -s \
  -o /tmp/bitstockerz-history-missing.json \
  -w '%{http_code}' "$BASE_URL/strategies/$STRATEGY_ID?version=99" \
  -H "Authorization: Bearer $OWNER_TOKEN")

test "$MISSING_VERSION_CODE" = 404
jq -e '.code == "STRATEGY_VERSION_NOT_FOUND"' \
  /tmp/bitstockerz-history-missing.json
```

- [x] Metadata-only changes preserve version 1 and `description: null` clears it.
- [x] Each present definition appends a version, including an identical repeat.
- [x] Version 1 remains readable with current metadata and historical markers.
- [x] A missing version returns `STRATEGY_VERSION_NOT_FOUND`.

## 7. Verify stable validation errors

```bash
BAD_TP=$(echo "$DEFINITION" | jq -c '.risk.take_profit.value = 500.01')
BAD_TP_BODY=$(jq -cn --argjson definition "$BAD_TP" '{
  name:"PR 9 Invalid TP",
  asset_type:"EQUITY",
  timeframe:"1d",
  definition:$definition
}')
BAD_TP_CODE=$(curl -s -o /tmp/bitstockerz-bad-tp.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BAD_TP_BODY")

test "$BAD_TP_CODE" = 400
jq -e '
  .code == "STRATEGY_VALIDATION_ERROR" and
  any(.fieldErrors[];
    .field == "definition.risk.take_profit.value" and
    (.reason | startswith("RISK_VALUE_OUT_OF_RANGE:")))
' /tmp/bitstockerz-bad-tp.json

EMPTY_UPDATE_CODE=$(curl -s -o /tmp/bitstockerz-empty-update.json \
  -w '%{http_code}' -X PUT "$BASE_URL/strategies/$STRATEGY_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}')
test "$EMPTY_UPDATE_CODE" = 400
jq -e '.code == "VALIDATION_ERROR"' /tmp/bitstockerz-empty-update.json

BAD_PAGE_CODE=$(curl -s -o /tmp/bitstockerz-bad-page.json \
  -w '%{http_code}' "$BASE_URL/strategies?limit=101&offset=-1" \
  -H "Authorization: Bearer $OWNER_TOKEN")
test "$BAD_PAGE_CODE" = 400
jq -e '.code == "VALIDATION_ERROR"' /tmp/bitstockerz-bad-page.json
```

- [x] `500.01%` is rejected with the exact nested path and strategy code.
- [x] Empty updates and out-of-bounds paging return generic request validation.

## 8. Verify ownership isolation

```bash
OTHER_TOKEN=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"strategy-other-$(date +%s)@example.com\",\"display_name\":\"PR 9 Other\"}" \
  | jq -r '.access_token')

OTHER_READ_CODE=$(curl -s -o /tmp/bitstockerz-other-read.json \
  -w '%{http_code}' "$BASE_URL/strategies/$STRATEGY_ID" \
  -H "Authorization: Bearer $OTHER_TOKEN")
OTHER_VALIDATE_CODE=$(curl -s -o /tmp/bitstockerz-other-validate.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies/validate" \
  -H "Authorization: Bearer $OTHER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"strategy_id\":\"$STRATEGY_ID\"}")

test "$OTHER_READ_CODE" = 404
test "$OTHER_VALIDATE_CODE" = 404
jq -e '.code == "STRATEGY_NOT_FOUND"' /tmp/bitstockerz-other-read.json
jq -e '.code == "STRATEGY_NOT_FOUND"' /tmp/bitstockerz-other-validate.json
```

Expected: cross-user reads and validation expose the same not-found response.

- [x] Another user receives `404 STRATEGY_NOT_FOUND` without existence leakage.

## 9. Verify soft delete semantics

```bash
DELETE_CREATE_BODY=$(jq -cn --argjson definition "$DEFINITION" '{
  name:"PR 9 Delete Target",
  asset_type:"EQUITY",
  timeframe:"1d",
  definition:$definition
}')
DELETE_TARGET_CODE=$(curl -s -o /tmp/bitstockerz-delete-create.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$DELETE_CREATE_BODY")
DELETE_ID=$(jq -r '.id' /tmp/bitstockerz-delete-create.json)
test "$DELETE_TARGET_CODE" = 201

DELETE_CODE=$(curl -s -o /tmp/bitstockerz-delete.json \
  -w '%{http_code}' -X DELETE "$BASE_URL/strategies/$DELETE_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN")
test "$DELETE_CODE" = 204
test ! -s /tmp/bitstockerz-delete.json

SECOND_DELETE_CODE=$(curl -s -o /tmp/bitstockerz-delete-again.json \
  -w '%{http_code}' -X DELETE "$BASE_URL/strategies/$DELETE_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN")
test "$SECOND_DELETE_CODE" = 404
jq -e '.code == "STRATEGY_NOT_FOUND"' /tmp/bitstockerz-delete-again.json

RESERVED_NAME_CODE=$(curl -s -o /tmp/bitstockerz-reserved-name.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$DELETE_CREATE_BODY")
test "$RESERVED_NAME_CODE" = 409
jq -e '.code == "CONFLICT"' /tmp/bitstockerz-reserved-name.json

curl -s "$BASE_URL/strategies" \
  -H "Authorization: Bearer $OWNER_TOKEN" |
  jq -e --arg id "$DELETE_ID" 'all(.items[]; .id != $id)'
```

- [x] Delete returns an empty `204`; repeated delete returns strategy not found.
- [x] Deleted strategies disappear from list/get and keep their names reserved.

## 10. Verify bounded audit metadata

```bash
docker exec bitstockerz-db \
  mysql -ubitstockerz -pdevpassword bitstockerz -N -e \
  "SELECT event_type, JSON_KEYS(payload_json)
   FROM audit_events
   WHERE event_type IN ('strategy.created','strategy.updated','strategy.deleted')
   ORDER BY id DESC
   LIMIT 8;"
```

Expected: recent results include all three event types. Created/deleted payloads
contain only `name` and `strategy_id`; updated payloads contain only
`changed_fields`, `strategy_id`, and `version_number`. Definitions and tokens
must not appear. If Docker credentials or the container name differ, adjust the
command.

- [x] Create, update, and delete audit rows exist with bounded metadata only.

## 11. Verify persistence across an API restart

Keep Terminal B and its variables open.

1. In **Terminal A**, stop the API with `Ctrl+C`.
2. Restart in the same MySQL mode:

   ```bash
   INGESTION_SCHEDULER_ENABLED=false npm --prefix apps/api run start:dev
   ```

3. In **Terminal B**, re-register the same email because sessions are
   intentionally process-local, then read latest and historical versions:

   ```bash
   OWNER_TOKEN=$(curl -s -X POST "$BASE_URL/auth/register" \
     -H 'Content-Type: application/json' \
     -d "{\"email\":\"$OWNER_EMAIL\",\"display_name\":\"PR 9 Owner Restart\"}" \
     | jq -r '.access_token')

   RESTART_CODE=$(curl -s -o /tmp/bitstockerz-strategy-restart.json \
     -w '%{http_code}' "$BASE_URL/strategies/$STRATEGY_ID" \
     -H "Authorization: Bearer $OWNER_TOKEN")
   RESTART_HISTORY_CODE=$(curl -s \
     -o /tmp/bitstockerz-history-restart.json \
     -w '%{http_code}' "$BASE_URL/strategies/$STRATEGY_ID?version=1" \
     -H "Authorization: Bearer $OWNER_TOKEN")

   test "$RESTART_CODE" = 200
   test "$RESTART_HISTORY_CODE" = 200
   jq -e --arg id "$STRATEGY_ID" --argjson expected "$NEW_DEFINITION" '
     .id == $id and .version_number == 3 and .definition == $expected
   ' /tmp/bitstockerz-strategy-restart.json
   jq -e --argjson expected "$DEFINITION" '
     .version_number == 1 and .definition == $expected and .is_latest == false
   ' /tmp/bitstockerz-history-restart.json
   ```

- [x] Latest version 3 and immutable version 1 both survive an API restart.

## 12. Verify the Sprint 3.1 engine-only surface

Sprint 3.1 intentionally adds **no HTTP route, database table, or UI**. There is
therefore no additional curl or visual workflow to perform manually. Run the
focused deterministic suite from the repository root:

```bash
npm --prefix apps/api test -- --runInBand backtest/engine
```

Expected:

- 8 test suites and 54 tests pass.
- The frozen 80-bar SMA-cross fixture matches its exact trades and metrics.
- The 365-bar daily fixture completes under two seconds.
- Coverage includes signal-close fills, 100% long sizing, stop-first SL/TP,
  the 500% take-profit threshold, no same-bar re-entry, forced final close,
  malformed/unsorted bars, invalid definitions, cancellation, deadlines, and
  bar/series-cell limits.

At the Sprint 3.1 boundary there was no `/api/backtests` route. Sections 14–15
below test the HTTP and UI surfaces subsequently added by Sprints 3.3–3.4.

- [x] Focused Sprint 3.1 suite passes 8 suites / 54 tests with no snapshots.
- [x] Reviewer confirms no backtest HTTP route or migration was expected in 3.1.

## 13. Verify the Sprint 3.2 persistence-only surface

Sprint 3.2 intentionally adds **no HTTP route or UI**. Its manual sign-off is
therefore one focused seed/unit command plus one real-MySQL round trip. Keep
MySQL running; the second command can run while the API from Terminal A is
running because it uses unique fixtures and cleans them in a `finally` block.

From the repository root, run:

```bash
npm --prefix apps/api test -- --runInBand \
  backtest-decimals \
  backtests.repository \
  backtests.service \
  strategy-version-pinning \
  strategies.service \
  auth.service \
  prisma.service
```

Expected:

- 7 test suites and 170 tests pass with no snapshots.
- Coverage includes latest/explicit immutable version pins, cross-owner
  isolation, pending/running/terminal compare-and-set races, transactional
  dependent writes, 500-row batching, copy-on-write seed parity, decimal
  boundaries, exact-cent initial capital, strategy/symbol/timeframe
  compatibility, deterministic ordering, sanitized failures, historical-pin
  replay after metadata drift, and malformed engine output, including trade
  P&L, sub-storage-step summary-metric contradictions, and fixed-scale summary
  recomputation.

Then load only the local database URL and run the isolated persistence gate:

```bash
source scripts/lib/load-api-env.sh
load_database_url_from_api_env "$PWD/apps/api"
NODE_ENV=development \
INGESTION_SCHEDULER_ENABLED=false \
LOG_LEVEL=silent \
  npm --prefix apps/api run test:mysql:backtest
```

Expected final line:

```text
Backtest MySQL persistence smoke PASS: round-trip, terminal immutability, and post-restart ownership remap verified.
```

That gate creates a user, symbol, strategy/version, run, result, trade, and two
equity points; reads them back through `BacktestsService`; confirms exact
dependent table counts; rejects a second terminal write; restarts the Nest
application; re-registers the same email; proves list/detail remap and retain
the completed run; and deletes all of its fixtures. A failure is a merge
blocker.

- [x] Focused Sprint 3.2 suite passes 7 suites / 170 tests with no snapshots.
- [x] MySQL persistence smoke prints its PASS line and exits with status `0`.
- [x] Reviewer confirms no `/api/backtests` route or UI was expected in 3.2.

## 14. Verify Sprint 3.3 backtest execution APIs

Keep the MySQL API running after Section 13. In Terminal B, ingest the rolling
AAPL fixture window, create a fresh deterministic backtest strategy, and derive
the exact test dates from the stored bars:

```bash
INGEST_CODE=$(curl -s -o /tmp/bitstockerz-backtest-ingest.json \
  -w '%{http_code}' -X POST "$BASE_URL/market-data/ingestion/equity" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"AAPL"}')
test "$INGEST_CODE" = 201
jq -e '.status == "completed" and .payload.imported_equity_bars >= 40' \
  /tmp/bitstockerz-backtest-ingest.json

BACKTEST_DEFINITION=$(jq -cn '{
  indicators:[
    {id:"fast",type:"SMA",params:{period:2},source:"close"}
  ],
  entry:{
    logic:"AND",
    conditions:[
      {left:{price:"close"},op:"gt",right:{literal:0}}
    ]
  },
  exit:{
    logic:"AND",
    conditions:[
      {left:{price:"close"},op:"lt",right:{literal:0}}
    ]
  },
  risk:{
    stop_loss:{type:"percent",value:2},
    take_profit:{type:"percent",value:500}
  }
}')

BACKTEST_STRATEGY_BODY=$(jq -cn --argjson definition "$BACKTEST_DEFINITION" '{
  name:("PR 9 Backtest " + (now | floor | tostring)),
  asset_type:"EQUITY",
  timeframe:"1d",
  definition:$definition
}')
BACKTEST_STRATEGY_CODE=$(curl -s \
  -o /tmp/bitstockerz-backtest-strategy.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BACKTEST_STRATEGY_BODY")
test "$BACKTEST_STRATEGY_CODE" = 201
BACKTEST_STRATEGY_ID=$(jq -r '.id' \
  /tmp/bitstockerz-backtest-strategy.json)

curl -s \
  "$BASE_URL/market-data/equities/candles?symbol=AAPL&start=2000-01-01&end=2099-12-31&order=desc&limit=40" \
  -o /tmp/bitstockerz-backtest-bars.json
jq -e 'length >= 40 and .[0].date > .[-1].date' \
  /tmp/bitstockerz-backtest-bars.json
BACKTEST_START=$(jq -r '.[-1].date' /tmp/bitstockerz-backtest-bars.json)
BACKTEST_END=$(jq -r '.[0].date' /tmp/bitstockerz-backtest-bars.json)
```

Run synchronously and inspect the compact response:

```bash
BACKTEST_BODY=$(jq -cn \
  --arg strategy "$BACKTEST_STRATEGY_ID" \
  --arg start "$BACKTEST_START" \
  --arg end "$BACKTEST_END" '{
    strategy_id:$strategy,
    symbol:"AAPL",
    timeframe:"1d",
    start_date:$start,
    end_date:$end,
    initial_equity:10000
  }')
BACKTEST_CODE=$(curl -s -o /tmp/bitstockerz-backtest-run.json \
  -w '%{http_code}' -X POST "$BASE_URL/backtests" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BACKTEST_BODY")
test "$BACKTEST_CODE" = 200
BACKTEST_RUN_ID=$(jq -r '.run.id' /tmp/bitstockerz-backtest-run.json)

jq -e --arg strategy "$BACKTEST_STRATEGY_ID" '
  .run.strategy_id == $strategy and
  .run.strategy_version_id > 0 and
  .run.symbol == "AAPL" and
  .run.timeframe == "1d" and
  .run.initial_equity == "10000.00" and
  .run.status == "completed" and
  (.run.job_id | type) == "string" and
  (.run.diagnostics.bars_processed >= 40) and
  (.run.diagnostics.duration_ms | type) == "number" and
  (.results.final_equity | type) == "string" and
  (.results.total_return_pct | type) == "string" and
  (.results.num_trades | type) == "number" and
  (has("trades") | not) and
  (has("equity_curve") | not)
' /tmp/bitstockerz-backtest-run.json
```

Expected: HTTP `200`, a completed linked job, bounded diagnostics, decimal
strings, and no full trade/curve arrays in the POST response.

Verify list filters and the paged detail contract:

```bash
LIST_CODE=$(curl -s -o /tmp/bitstockerz-backtest-list.json \
  -w '%{http_code}' \
  "$BASE_URL/backtests?symbol=aapl&status=completed&limit=1&offset=0" \
  -H "Authorization: Bearer $OWNER_TOKEN")
test "$LIST_CODE" = 200
jq -e --arg run "$BACKTEST_RUN_ID" '
  .limit == 1 and .offset == 0 and
  .items[0].id == $run and
  .items[0].strategy_name != null and
  .items[0].symbol == "AAPL" and
  (.items[0].total_return_pct | type) == "string" and
  (.items[0] | has("trades") | not) and
  (.items[0] | has("equity_curve") | not)
' /tmp/bitstockerz-backtest-list.json

DETAIL_CODE=$(curl -s -o /tmp/bitstockerz-backtest-detail.json \
  -w '%{http_code}' \
  "$BASE_URL/backtests/$BACKTEST_RUN_ID?trades_limit=1&trades_offset=0" \
  -H "Authorization: Bearer $OWNER_TOKEN")
test "$DETAIL_CODE" = 200
jq -e --arg run "$BACKTEST_RUN_ID" '
  .run.id == $run and
  (.equity_curve | length) >= 40 and
  .trades_page.limit == 1 and
  .trades_page.offset == 0 and
  (.trades | length) <= 1 and
  all(.trades[];
    (.id | type) == "number" and
    (.entry_price | type) == "string" and
    (.pnl_abs | type) == "string")
' /tmp/bitstockerz-backtest-detail.json
```

Verify authentication, ownership, and conservative bar-limit failures:

```bash
UNAUTH_BACKTEST_CODE=$(curl -s \
  -o /tmp/bitstockerz-backtest-unauth.json \
  -w '%{http_code}' "$BASE_URL/backtests")
test "$UNAUTH_BACKTEST_CODE" = 401
jq -e '.code == "UNAUTHORIZED"' \
  /tmp/bitstockerz-backtest-unauth.json

BACKTEST_OTHER_TOKEN=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"backtest-other-$(date +%s)@example.com\"}" \
  | jq -r '.access_token')
CROSS_OWNER_BACKTEST_CODE=$(curl -s \
  -o /tmp/bitstockerz-backtest-cross-owner.json \
  -w '%{http_code}' "$BASE_URL/backtests/$BACKTEST_RUN_ID" \
  -H "Authorization: Bearer $BACKTEST_OTHER_TOKEN")
test "$CROSS_OWNER_BACKTEST_CODE" = 404
jq -e '.code == "BACKTEST_NOT_FOUND"' \
  /tmp/bitstockerz-backtest-cross-owner.json

OVERSIZE_BODY=$(jq -cn --arg strategy "$BACKTEST_STRATEGY_ID" '{
  strategy_id:$strategy,
  symbol:"AAPL",
  timeframe:"1d",
  start_date:"1900-01-01",
  end_date:"2099-12-31"
}')
OVERSIZE_CODE=$(curl -s -o /tmp/bitstockerz-backtest-oversize.json \
  -w '%{http_code}' -X POST "$BASE_URL/backtests" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$OVERSIZE_BODY")
test "$OVERSIZE_CODE" = 400
jq -e '.code == "BACKTEST_BAR_LIMIT_EXCEEDED"' \
  /tmp/bitstockerz-backtest-oversize.json

# Make the next UI-launched run exercise the explicit no-trades state while
# preserving the completed version-1 run above as the real table case.
NO_TRADE_DEFINITION=$(jq -cn '{
  indicators:[
    {id:"fast",type:"SMA",params:{period:2},source:"close"}
  ],
  entry:{
    logic:"AND",
    conditions:[
      {left:{price:"close"},op:"lt",right:{literal:0}}
    ]
  },
  exit:{
    logic:"AND",
    conditions:[
      {left:{price:"close"},op:"gt",right:{literal:0}}
    ]
  },
  risk:{
    stop_loss:{type:"percent",value:2},
    take_profit:{type:"percent",value:500}
  }
}')
NO_TRADE_VERSION_CODE=$(curl -s \
  -o /tmp/bitstockerz-backtest-no-trade-version.json \
  -w '%{http_code}' -X PUT \
  "$BASE_URL/strategies/$BACKTEST_STRATEGY_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -cn --argjson definition "$NO_TRADE_DEFINITION" \
    '{definition:$definition}')")
test "$NO_TRADE_VERSION_CODE" = 200
jq -e '.version_number == 2' \
  /tmp/bitstockerz-backtest-no-trade-version.json
```

Finally, with the default `10` requests / `60` seconds rate configuration,
verify that only the POST execution surface is throttled. Use a fresh account
so earlier requests do not affect the count:

```bash
RATE_TOKEN=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"backtest-rate-$(date +%s)@example.com\"}" \
  | jq -r '.access_token')
for REQUEST_NUMBER in $(seq 1 11); do
  RATE_CODE=$(curl -s -o /tmp/bitstockerz-backtest-rate.json \
    -w '%{http_code}' -X POST "$BASE_URL/backtests" \
    -H "Authorization: Bearer $RATE_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{}')
  if test "$REQUEST_NUMBER" -le 10; then
    test "$RATE_CODE" = 400
  else
    test "$RATE_CODE" = 429
  fi
done
jq -e '.code == "RATE_LIMITED"' /tmp/bitstockerz-backtest-rate.json

curl -s "$BASE_URL/backtests" \
  -H "Authorization: Bearer $RATE_TOKEN" \
  | jq -e '.items == []'
```

- [x] POST completes through a linked job and returns bounded summary data.
- [x] Owner list and detail expose the canonical shape, full curve, and stable trade ids.
- [x] Unauthenticated, cross-owner, bar-limit, and rate-limit responses use the expected stable codes.
- [x] A rate-limited user can still read their backtest list.

## 15. Verify the Sprint 3.4 Angular backtest UI

Keep the API running. In **Terminal C**, install and start the web app:

```bash
npm --prefix apps/web ci
npm run web:start
```

Open `http://localhost:4200` in a browser and complete this sequence:

1. Confirm the protected root redirects to `/login`. Register a fresh
   throwaway email, confirm the empty `/backtests` state and **Create the first
   run** CTA, then log out.
2. Enter the value of `$OWNER_EMAIL` from Terminal B and choose **Log in**.
   The owner was re-registered after the API restart in Section 11.
3. Confirm `/backtests` shows the AAPL run from Section 14 with strategy name,
   completed status, return, drawdown, and trade count.
4. Open that run. Confirm the UTC date range matches
   `$BACKTEST_START`–`$BACKTEST_END`, the six metric cards have finite values,
   the equity curve has real time/equity axes, and the trades section renders
   a semantic table or its explicit no-trades state.
5. Open **Run backtest** and first use the valid-but-missing strategy id
   `00000000-0000-4000-8000-000000000000`; confirm a readable API error remains
   on the form. Replace it with `$BACKTEST_STRATEGY_ID`, use AAPL / 1 day /
   `$BACKTEST_START` / `$BACKTEST_END` / 10000, and submit. The button must show
   `Running…`, disable duplicate submission, and navigate to the new detail
   page on success. If execution is too fast to observe the loading label,
   temporarily select Slow 3G in browser network throttling and repeat.
6. The new version-2 run must show metrics and the explicit **No trades were
   generated for this run** state. Return to `/backtests`; both the original
   one-trade version-1 run and new zero-trade run must be present. Complete the
   required 501-trade pagination gate below; it is part of Sprint 3.4 acceptance
   and is not deferred to a later roadmap item.
7. Resize the browser to 390 × 844. Confirm header/nav wrap cleanly, the run
   form becomes one column, metric cards remain readable, the chart stays
   within the viewport, and the trades table scrolls horizontally instead of
   widening the page.
8. After confirming the deliberate missing-strategy error in step 5, clear the
   browser console and network log. Confirm there are no console errors or
   unexpected failed API requests during the successful list, run, detail, and
   resize flow. The earlier `POST /api/backtests` `404` is expected test
   evidence, not a failure of this clean pass.
9. Choose **Log out**. Confirm the token is removed and a direct visit to a
   backtest detail URL redirects to `/login` with no protected data rendered.

### Required 501-trade pagination gate

Use the completed `$BACKTEST_RUN_ID` from Section 14 as the ownership, result,
and equity-curve source for an isolated local fixture. The helper refuses to
overwrite an existing fixture, verifies all 501 rows after creation, and its
cleanup relies on the fixture run's database cascades. In Terminal B:

```bash
PAGINATION_RUN_ID=50100000-0000-4000-8000-000000000009
./scripts/backtest-pagination-fixture.sh cleanup
./scripts/backtest-pagination-fixture.sh create "$BACKTEST_RUN_ID"

curl -s \
  "$BASE_URL/backtests/$PAGINATION_RUN_ID?trades_limit=500&trades_offset=0" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -o /tmp/bitstockerz-pagination-page1.json
curl -s \
  "$BASE_URL/backtests/$PAGINATION_RUN_ID?trades_limit=500&trades_offset=500" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -o /tmp/bitstockerz-pagination-page2.json

jq -s -e '
  (.[0].results.num_trades == 501) and
  (.[0].trades | length) == 500 and
  (.[0].trades_page == {limit:500,offset:0,has_more:true}) and
  (.[1].trades | length) == 1 and
  (.[1].trades_page == {limit:500,offset:500,has_more:false}) and
  ([.[].trades[].id] | length) == 501 and
  ([.[].trades[].id] | unique | length) == 501
' /tmp/bitstockerz-pagination-page1.json \
  /tmp/bitstockerz-pagination-page2.json
```

Before opening the fixture, clear the browser console and network log. While
logged in as `$OWNER_EMAIL`, visit
`http://localhost:4200/backtests/50100000-0000-4000-8000-000000000009`, then
confirm all of the following:

1. The detail page initially says **500 loaded**, renders 500 table rows, and
   shows **Load more trades**.
2. Selecting **Load more trades** sends one successful request with
   `trades_limit=500&trades_offset=500`.
3. The page then says **501 loaded**, renders 501 unique rows, and removes the
   button because `has_more` is false.
4. The browser console has no errors and the two detail requests both return
   HTTP `200`.

Remove only the isolated fixture after the browser check:

```bash
./scripts/backtest-pagination-fixture.sh cleanup
```

The append/deduplication/button-removal behavior also has a component
regression test in `backtest-detail.page.spec.ts` and is exercised by
`npm run web:test`.

The checked-in contract fixture used by the mapper unit test is
`docs/manual-testing/fixtures/backtest-detail.example.json`; it is reference
data, not a substitute for this live MySQL/browser workflow.

- [x] Login → list → run → detail is fully demoable against the live API.
- [x] Metrics, chart, trade/no-trade state, and UTC dates match the API result.
- [x] The required 501-trade fixture loads 500 + 1 unique rows and removes the pagination control.
- [x] Desktop and 390px mobile layouts have no clipping or page-width overflow.
- [x] Browser console/network remain clean and logout protects deep links.

## 16. Verify generated OpenAPI and Swagger UI

Keep the API running and use Terminal B to verify both machine-readable
formats. The assertions deliberately cover route inclusion/exclusion, bearer
security, exact backtest list/detail schemas, and the trade-pagination contract:

```bash
curl -fsS "$BASE_URL/openapi.json" \
  -o /tmp/bitstockerz-openapi.json
curl -fsS "$BASE_URL/openapi.yaml" \
  -o /tmp/bitstockerz-openapi.yaml

jq -e '
  .openapi == "3.0.0" and
  (.paths | has("/api") | not) and
  (.paths | has("/api/error-test/{path}") | not) and
  .paths["/api/backtests/{id}"].get.security ==
    [{"bearer-session":[]}] and
  (.paths["/api/backtests/{id}"].get.parameters |
    any(.name == "trades_limit" and .in == "query" and
      .schema.default == 500 and .schema.maximum == 1000)) and
  (.paths["/api/backtests/{id}"].get.parameters |
    any(.name == "trades_offset" and .in == "query" and
      .schema.default == 0 and .schema.maximum == 100000)) and
  .components.schemas.BacktestList.properties.items.items["$ref"] ==
    "#/components/schemas/BacktestListItem" and
  (.components.schemas.BacktestListItem.allOf[1].required |
    index("strategy_name")) != null and
  (.components.schemas.BacktestRun.properties |
    has("strategy_name") | not) and
  .components.schemas.BacktestDetail.properties.trades_page.required ==
    ["limit","offset","has_more"] and
  .components.schemas.BacktestDetail.properties.trades_page.properties.offset.maximum ==
    100000
' /tmp/bitstockerz-openapi.json

grep -Eq '^openapi: 3\.0\.0$' /tmp/bitstockerz-openapi.yaml
```

Open `http://localhost:4000/api/docs` in a real browser and confirm:

1. The page title is **BitStockerz API Docs**, the **Authorize** control is
   present, and the Backtests tag lists the run, list, and detail operations.
2. Expand **GET `/api/backtests/{id}`**. It shows the required UUID path value,
   optional `trades_limit` and `trades_offset` query inputs, bearer security,
   and the documented `200`, `400`, `401`, `404`, and `500` responses.
3. The browser console has no errors and the JSON/YAML endpoints return HTTP
   `200`.

- [x] Generated JSON/YAML and the live Swagger UI expose the exact shipped backtest pagination contract.

## Sign-off

Merge only when every box above is checked. Record a failure on PR #9 with the
section number, HTTP response, and relevant API log excerpt.

Cleanup:

```bash
./scripts/backtest-pagination-fixture.sh cleanup
rm -f /tmp/bitstockerz-{indicators,strategy-create,validate-valid,validate-persisted,validate-invalid,validate-xor,strategy-list,update-metadata,update-v2,update-v3,history-v1,history-missing,bad-tp,empty-update,bad-page,other-read,other-validate,delete-create,delete,delete-again,reserved-name,strategy-restart,history-restart,backtest-ingest,backtest-strategy,backtest-bars,backtest-run,backtest-list,backtest-detail,backtest-unauth,backtest-cross-owner,backtest-oversize,backtest-no-trade-version,backtest-rate,pagination-page1,pagination-page2,openapi}.json
rm -f /tmp/bitstockerz-openapi.yaml
```
