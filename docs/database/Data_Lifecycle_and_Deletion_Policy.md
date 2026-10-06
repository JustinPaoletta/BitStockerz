# BitStockerz — Data lifecycle and deletion

This policy describes the October 4 implementation.
The [runtime schema](../../apps/api/prisma/schema.prisma) and migrations define its database relationships.
Conceptual schemas under `docs/database` retain older design targets and do not define current deletion behavior.

## Normal use

| Data                                  | Current lifecycle                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Users and sign-in methods             | Retained until credential removal, session revocation, or account deletion.                                     |
| Strategies                            | Ordinary strategy deletion sets `is_active=false`. Version snapshots remain available to owned historical runs. |
| Strategy versions                     | Immutable after creation; removed with account deletion.                                                        |
| Backtest runs and results             | Completed results remain immutable. Account deletion removes owned runs and their dependent rows.               |
| Paper ledger                          | Atomic fills update cash and positions. Reset archives the old ledger; account deletion removes it.             |
| Watchlists and paper runners          | Owner-scoped. Reset stops runners; account deletion removes them.                                               |
| Jobs, AI usage, and user audit events | Retained in active storage until account deletion; no automatic retention purge is implemented.                 |
| Symbols and OHLCV bars                | Shared reference data survives account deletion. Imports can update existing bars, including adjusted history.  |

Market data is not strictly append-only.
Operators can upsert corrected or adjusted prices through validated import paths.
Inactive symbols are excluded from health coverage counts.

## Personal export

An authenticated user can download personal JSON through `GET /api/workspace/account-export`.
Database mode uses a consistent read transaction.
The export includes owned research, paper-account history, reset archives, runners, and account metadata.
Session and credential identifiers are hashed.
The export excludes bearer tokens, public keys, and OAuth subjects.
Trading and backtest CSV files are separate exports.

## Paper-account reset

`POST /api/workspace/paper/reset` requires a sign-in within five minutes and the exact confirmation `RESET`.
Reset serializes account changes and archives the prior ledger and runner state.
It retires previous client-order identifiers to prevent old requests from recreating trades.
It restores cash to the configured starting balance and clears active orders, executions, and positions.
It stops existing runners.
Reset archives remain until account deletion.

## Credential and session removal

Users can revoke their owned sessions.
Passkey enrollment and removal require a sign-in within five minutes.
Removal of the last passkey requires another linked sign-in method.
Development-only email access does not provide production recovery.
Recovery requires a usable passkey or a provider linked before device loss.

## Account deletion

`DELETE /api/workspace/account` requires a sign-in within five minutes and exact email confirmation.
The request fails while owned jobs are pending or running.
Deletion prevents new user writes and waits for writes already in progress.
A serialized transaction removes the user's owned active-database records:

- Profile, sessions, credentials, OAuth identities, and auth ceremonies.
- Strategies, versions, backtest runs, results, trades, and equity points.
- Paper account, orders, executions, positions, and retired order identifiers.
- Watchlists, reset archives, and paper runners.
- Owned jobs, AI usage, and user audit events.

After deletion, the API invalidates sessions and removes the user's process-local state.
Shared symbols and market prices remain available.
Seed mode uses the same ownership boundaries, but its data disappears on process restart.

## External logs and backups

Active-data deletion does not erase existing host logs or database backups.
Their providers, retention periods, purge schedules, and restoration controls remain launch prerequisites.
No published retention period or automatic backup purge is implemented by the application.

Operators must keep a restricted deletion-request record outside restored application backups.
That record requires minimal identifiers, access controls, and its own purge policy.
Before restored data serves traffic, operators must reapply recorded deletion requests.
The record and restoration drill remain unimplemented operational work.
See [deployment](../ops/deployment.md#backups-alerts-and-support) and the [remaining task list](../../PRODUCT_TASKLIST.md).
