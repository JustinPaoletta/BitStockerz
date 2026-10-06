# BitStockerz — Migration history

Apply migrations from [apps/api/prisma/migrations](../../apps/api/prisma/migrations).
The runtime schema is [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma).
The SQL and Prisma files under `docs/database` are conceptual design sources.
Their original `V0001`-style names are not runnable migrations.

## Runnable migrations

| Sprint scope                                             | Prisma migration folder                             |
| -------------------------------------------------------- | --------------------------------------------------- |
| Core auth tables (0.1–0.2)                               | `20260421100000_core_auth_tables`                   |
| Symbols + OHLCV schemas (1.1)                            | `20260421110000_sprint_1_1_symbols_and_market_data` |
| Jobs table (1.3)                                         | `20260711000000_sprint_1_3_jobs`                    |
| Audit events (1.4)                                       | `20260724150000_sprint_1_4_audit_events`            |
| Strategies + immutable versions (2.1)                    | `20260725120000_sprint_2_1_strategies`              |
| Backtest runs/results/trades/equity points (3.2)         | `20260728213000_sprint_3_2_backtest_tables`         |
| Deferred backtest-run → job foreign key (3.2)            | `20260728213100_sprint_3_2_backtest_runs_job_fk`    |
| Paper accounts (4.1)                                     | `20260802010000_sprint_4_1_paper_accounts`          |
| Positions (4.1)                                          | `20260802010100_sprint_4_1_positions`               |
| Orders (4.2)                                             | `20260802020000_sprint_4_2_orders`                  |
| Executions (4.2)                                         | `20260802020100_sprint_4_2_executions`              |
| Trading price precision alignment (4.1–4.2)              | `20260802030000_sprint_4_trading_price_precision`   |
| AI daily usage quotas (6.1)                              | `20260808000000_sprint_6_1_ai_usage`                |
| Auth persistence (sessions, OAuth, challenges)           | `20260911000000_auth_persistence`                   |
| Browser OAuth handoffs and explicit linking (8.1)        | `20261002000000_oauth_browser_handoff`              |
| Case-sensitive opaque auth identifiers (security review) | `20261002010000_auth_identifiers_binary`            |

| Research settings, benchmark, and trade fees | `202610040001_product_research` |
| Bound additional-passkey enrollment challenges | `202610040002_account_management` |
| Watchlists, reset archives, retired order keys, and paper runners | `202610040003_product_workspace` |

## Apply and inspect

For local setup, follow [Local MySQL](Local_MySQL.md).
Supply `DATABASE_URL` through local configuration or secret storage.
From the repository root, apply the migrations:

```sh
npm --prefix apps/api run db:deploy
```

From `apps/api`, inspect the applied history:

```sh
npx prisma migrate status
```

Before migrating an existing database, run the
[OAuth identity preflight](../ops/deployment.md#googleapple-login-and-recovery-setup).
Resolve duplicate `(user_id, provider)` identities with an explicit account-owner decision.
Do not delete recovery identities automatically.

## Ordering and compatibility

Prisma applies migration folders in timestamp order.
Published migration files remain unchanged; subsequent changes require a new migration.

The backtest table migration creates runs and dependent results, trades, and equity points.
Its separate job constraint uses `ON DELETE SET NULL ON UPDATE CASCADE`.
Run deletion cascades to dependent result rows; other parent references use restrictive foreign keys.

The trading precision migration widens unit prices to `DECIMAL(20,8)`.
It preserves eight fractional digits and supports the market-data price range.
Browser handoffs add verifier, actor, session, expiry, and one-use-code binding.
The next auth migration gives opaque identifiers binary collation without changing email/profile collations.

The October 4 migrations add research settings and account-workspace persistence.
Older binaries must tolerate these additions before an operator rolls back the API.
Do not remove customer data to reverse an application deployment.

## Evidence and outstanding checks

The first 16 migrations passed fresh-MySQL CI for PR #13 on October 2, 2026.
The three October 4 migrations have passed schema validation, but their MySQL execution remains unverified locally.
Docker Desktop did not respond during that local run.
All five MySQL harnesses and final-revision CI remain required before release.
See the [testing strategy](../product/requirements/Testing_Strategy.md).
