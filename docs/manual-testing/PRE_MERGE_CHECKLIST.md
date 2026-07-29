# PR #9 Pre-Merge Manual Checklist

This is the single required pre-merge test document for
[PR #9](https://github.com/JustinPaoletta/BitStockerz/pull/9). It covers the
human-visible behavior added by Sprints 2.1–2.3 and the automated-only engine
surface added by Sprint 3.1, plus the internal persistence surface added by
Sprint 3.2. General unit, coverage, e2e, seed-smoke, and MySQL-smoke gates are
not duplicated except for the focused 3.1/3.2 commands needed to sign off
sprints that intentionally have no HTTP or UI surface.

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

- [ ] API starts in MySQL mode and readiness reports the database `up`.

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

- [ ] Catalog is public and exposes the exact SMA/EMA/RSI contract.

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

- [ ] Create returns `201`, immutable version 1, exact JSON, and exact summary.
- [ ] A take-profit value of exactly `500%` is accepted and displayed.

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

- [ ] Inline and persisted validation return the same deterministic summary.
- [ ] Invalid rules return structured errors and `summary: null` without writes.
- [ ] Both/neither validation inputs return `STRATEGY_VALIDATION_ERROR`.

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

- [ ] Owner list uses the documented envelope and lightweight item shape.

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

- [ ] Metadata-only changes preserve version 1 and `description: null` clears it.
- [ ] Each present definition appends a version, including an identical repeat.
- [ ] Version 1 remains readable with current metadata and historical markers.
- [ ] A missing version returns `STRATEGY_VERSION_NOT_FOUND`.

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

- [ ] `500.01%` is rejected with the exact nested path and strategy code.
- [ ] Empty updates and out-of-bounds paging return generic request validation.

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

- [ ] Another user receives `404 STRATEGY_NOT_FOUND` without existence leakage.

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

- [ ] Delete returns an empty `204`; repeated delete returns strategy not found.
- [ ] Deleted strategies disappear from list/get and keep their names reserved.

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

- [ ] Create, update, and delete audit rows exist with bounded metadata only.

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

- [ ] Latest version 3 and immutable version 1 both survive an API restart.

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

Do not look for `/api/backtests` yet: Sprint 3.2 provides only the internal
persistence service; the HTTP execution surface arrives in Sprint 3.3.

- [ ] Focused Sprint 3.1 suite passes 8 suites / 54 tests with no snapshots.
- [ ] Reviewer confirms no backtest HTTP route or migration was expected in 3.1.

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

- 7 test suites and 166 tests pass with no snapshots.
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

- [ ] Focused Sprint 3.2 suite passes 7 suites / 166 tests with no snapshots.
- [ ] MySQL persistence smoke prints its PASS line and exits with status `0`.
- [ ] Reviewer confirms no `/api/backtests` route or UI was expected in 3.2.

## Sign-off

Merge only when every box above is checked. Record a failure on PR #9 with the
section number, HTTP response, and relevant API log excerpt.

Cleanup:

```bash
rm -f /tmp/bitstockerz-{indicators,strategy-create,validate-valid,validate-persisted,validate-invalid,validate-xor,strategy-list,update-metadata,update-v2,update-v3,history-v1,history-missing,bad-tp,empty-update,bad-page,other-read,other-validate,delete-create,delete,delete-again,reserved-name,strategy-restart,history-restart}.json
```
