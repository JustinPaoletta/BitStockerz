# PR #9 Pre-Merge Manual Checklist

This is the single required manual-test document for
[PR #9](https://github.com/JustinPaoletta/BitStockerz/pull/9). It covers the
human-visible behavior added by Sprints 2.1 and 2.2. Unit, coverage, e2e, seed
smoke, and MySQL smoke gates are automated and are not repeated here.

Run commands from the repository root. Prerequisites are Node.js `24.11.1`,
npm, `curl`, `jq`, and Docker Desktop. Use two terminals and keep the variables
in Terminal B until the restart check is complete.

## 1. Start the API in MySQL mode

In **Terminal A**:

```bash
./scripts/docker-mysql.sh start
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
# Confirm apps/api/.env contains the DATABASE_URL printed by the command above.
npm --prefix apps/api run db:deploy
INGESTION_SCHEDULER_ENABLED=false npm --prefix apps/api run start:dev
```

In **Terminal B**:

```bash
BASE_URL=http://localhost:4000/api
curl -s "$BASE_URL/health/ready" | jq -e '.checks.database.status == "up"'
```

Expected: `true`. Stop here if the database is not `up`; otherwise later
persistence checks would only prove in-memory behavior.

- [ ] API starts in MySQL mode and readiness reports the database `up`.

## 2. Verify the public indicator catalog

No bearer token should be sent:

```bash
curl -s "$BASE_URL/strategies/indicators" \
  -o /tmp/bitstockerz-indicators.json

jq . /tmp/bitstockerz-indicators.json
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

Expected: the final command prints `true`.

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

CREATE_BODY=$(jq -cn --argjson definition "$DEFINITION" '{
  name:"PR 9 Manual Strategy",
  description:"Canonical 2.2 definition with the 500% TP ceiling",
  asset_type:"EQUITY",
  timeframe:"1d",
  definition:$definition
}')

CREATE_CODE=$(curl -s -o /tmp/bitstockerz-strategy-create.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$CREATE_BODY")

echo "HTTP $CREATE_CODE"
jq . /tmp/bitstockerz-strategy-create.json
STRATEGY_ID=$(jq -r '.id' /tmp/bitstockerz-strategy-create.json)

test "$CREATE_CODE" = 201
jq -e --argjson expected "$DEFINITION" '
  .name == "PR 9 Manual Strategy" and
  .symbol_scope == "SINGLE" and
  .is_active == true and
  .version_number == 1 and
  .definition == $expected
' /tmp/bitstockerz-strategy-create.json
```

Expected: both assertions pass. This specifically proves that `500` is
accepted, not rounded or replaced.

- [ ] Canonical strategy creation returns `201`, version 1, and exact JSON.
- [ ] A take-profit value of exactly `500` is accepted.

## 4. Verify owner read and exact round trip

```bash
READ_CODE=$(curl -s -o /tmp/bitstockerz-strategy-read.json \
  -w '%{http_code}' "$BASE_URL/strategies/$STRATEGY_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN")

test "$READ_CODE" = 200
jq -e --arg id "$STRATEGY_ID" --argjson expected "$DEFINITION" '
  .id == $id and .version_number == 1 and .definition == $expected
' /tmp/bitstockerz-strategy-read.json
```

Expected: both assertions pass.

- [ ] The owner can read the strategy and the canonical definition round-trips exactly.

## 5. Verify definition validation errors

### Take profit above 500%

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
  .code == "VALIDATION_ERROR" and
  any(.fieldErrors[];
    .field == "definition.risk.take_profit.value" and
    (.reason | startswith("RISK_VALUE_OUT_OF_RANGE:")))
' /tmp/bitstockerz-bad-tp.json
```

### OR logic

```bash
BAD_OR=$(echo "$DEFINITION" | jq -c '.entry.logic = "OR"')
BAD_OR_BODY=$(jq -cn --argjson definition "$BAD_OR" '{
  name:"PR 9 Invalid OR",
  asset_type:"EQUITY",
  timeframe:"1d",
  definition:$definition
}')

BAD_OR_CODE=$(curl -s -o /tmp/bitstockerz-bad-or.json \
  -w '%{http_code}' -X POST "$BASE_URL/strategies" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BAD_OR_BODY")

test "$BAD_OR_CODE" = 400
jq -e '
  .code == "VALIDATION_ERROR" and
  any(.fieldErrors[];
    .field == "definition.entry.logic" and
    .reason == "OR_NOT_SUPPORTED: logic must be AND.")
' /tmp/bitstockerz-bad-or.json
```

Expected: all four assertions pass. The error paths should be precise and the
stable validator code should be at the start of `reason`.

- [ ] `500.01` is rejected at `definition.risk.take_profit.value`.
- [ ] OR is rejected at `definition.entry.logic` with `OR_NOT_SUPPORTED`.

## 6. Verify ownership isolation

```bash
OTHER_TOKEN=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"strategy-other-$(date +%s)@example.com\",\"display_name\":\"PR 9 Other\"}" \
  | jq -r '.access_token')

OTHER_CODE=$(curl -s -o /tmp/bitstockerz-other-read.json \
  -w '%{http_code}' "$BASE_URL/strategies/$STRATEGY_ID" \
  -H "Authorization: Bearer $OTHER_TOKEN")

test "$OTHER_CODE" = 404
jq -e '.code == "NOT_FOUND"' /tmp/bitstockerz-other-read.json
```

Expected: both assertions pass; the API does not disclose cross-user existence.

- [ ] Another user receives `404 NOT_FOUND`.

## 7. Verify bounded audit metadata

```bash
docker exec bitstockerz-db \
  mysql -ubitstockerz -pdevpassword bitstockerz -N -e \
  "SELECT event_type, JSON_KEYS(payload_json)
   FROM audit_events
   WHERE event_type = 'strategy.created'
   ORDER BY id DESC
   LIMIT 1;"
```

Expected: one `strategy.created` row whose keys are `name` and `strategy_id`.
The full definition must not appear. If you overrode the Docker database
credentials or container name, use those values in this command.

- [ ] The audit event exists and does not store the definition or token.

## 8. Verify persistence across an API restart

Keep Terminal B and its variables open.

1. In **Terminal A**, stop the API with `Ctrl+C`.
2. Restart it in the same MySQL mode:

   ```bash
   INGESTION_SCHEDULER_ENABLED=false npm --prefix apps/api run start:dev
   ```

3. Back in **Terminal B**, re-register the same email because sessions are
   intentionally process-local, then read the original strategy:

   ```bash
   OWNER_TOKEN=$(curl -s -X POST "$BASE_URL/auth/register" \
     -H 'Content-Type: application/json' \
     -d "{\"email\":\"$OWNER_EMAIL\",\"display_name\":\"PR 9 Owner Restart\"}" \
     | jq -r '.access_token')

   RESTART_CODE=$(curl -s -o /tmp/bitstockerz-strategy-restart.json \
     -w '%{http_code}' "$BASE_URL/strategies/$STRATEGY_ID" \
     -H "Authorization: Bearer $OWNER_TOKEN")

   test "$RESTART_CODE" = 200
   jq -e --arg id "$STRATEGY_ID" --argjson expected "$DEFINITION" '
     .id == $id and .version_number == 1 and .definition == $expected
   ' /tmp/bitstockerz-strategy-restart.json
   ```

Expected: both assertions pass; the original id and canonical definition remain.

- [ ] The same owner can read the original strategy after an API restart.

## Sign-off

Merge only when every box above is checked. Record any failure directly on PR
#9 with the failed section number, HTTP response, and API log excerpt.

Cleanup:

```bash
rm -f /tmp/bitstockerz-indicators.json \
  /tmp/bitstockerz-strategy-create.json \
  /tmp/bitstockerz-strategy-read.json \
  /tmp/bitstockerz-bad-tp.json \
  /tmp/bitstockerz-bad-or.json \
  /tmp/bitstockerz-other-read.json \
  /tmp/bitstockerz-strategy-restart.json
```
