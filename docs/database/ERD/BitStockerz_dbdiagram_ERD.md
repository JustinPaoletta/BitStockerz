////////////////////////////////////////////////////
// BitStockerz - DBML for dbdiagram.io
// Structural schema only. Deletion / lifecycle
// rules are handled at the application level.
////////////////////////////////////////////////////

// 1) Core

Table users {
  id            varchar(36)  [pk]
  email         varchar(255) [not null, unique]
  created_at    datetime     [not null]
  updated_at    datetime     [not null]
  deleted_at    datetime
}

Table webauthn_credentials {
  credential_id varchar(255) [pk]
  user_id       varchar(36)  [not null]
  public_key    text         [not null]
  sign_count    bigint       [not null]
  transports    varchar(255)
  aaguid        varchar(36)
  created_at    datetime     [not null]
}

// 2) Market data

Table symbols {
  id          int           [pk]
  symbol      varchar(32)   [not null, unique]
  name        varchar(255)  [not null]
  asset_type  varchar(16)   [not null] // EQUITY | CRYPTO
  exchange    varchar(64)
  currency    varchar(16)   [not null]
  base_asset  varchar(32)
  quote_asset varchar(32)
  is_active   boolean       [not null]
  created_at  datetime      [not null]
  updated_at  datetime      [not null]
}

Table equity_daily_bars {
  id         int           [pk]
  symbol_id  int           [not null]
  date       date          [not null]
  open       decimal(18,6) [not null]
  high       decimal(18,6) [not null]
  low        decimal(18,6) [not null]
  close      decimal(18,6) [not null]
  volume     decimal(24,8) [not null]
  provider   varchar(64)   [not null]
  created_at datetime      [not null]

  indexes {
    (symbol_id, date) [unique]
  }
}

Table crypto_daily_bars {
  id         int           [pk]
  symbol_id  int           [not null]
  date       date          [not null]
  open       decimal(18,6) [not null]
  high       decimal(18,6) [not null]
  low        decimal(18,6) [not null]
  close      decimal(18,6) [not null]
  volume     decimal(24,8) [not null]
  provider   varchar(64)   [not null]
  created_at datetime      [not null]

  indexes {
    (symbol_id, date) [unique]
  }
}

Table crypto_hourly_bars {
  id         int           [pk]
  symbol_id  int           [not null]
  ts         datetime      [not null]
  open       decimal(18,6) [not null]
  high       decimal(18,6) [not null]
  low        decimal(18,6) [not null]
  close      decimal(18,6) [not null]
  volume     decimal(24,8) [not null]
  provider   varchar(64)   [not null]
  created_at datetime      [not null]

  indexes {
    (symbol_id, ts) [unique]
  }
}

// 3) Paper trading

Table paper_accounts {
  id               int           [pk]
  user_id          varchar(36)   [not null]
  name             varchar(255)  [not null]
  base_currency    varchar(16)   [not null]
  starting_balance decimal(18,2) [not null]
  cash_balance     decimal(18,2) [not null]
  is_active        boolean       [not null]
  created_at       datetime      [not null]
  updated_at       datetime      [not null]
}

Table orders {
  id               varchar(36)   [pk]
  paper_account_id int           [not null]
  symbol_id        int           [not null]
  side             varchar(8)    [not null] // BUY | SELL
  quantity         decimal(18,8) [not null]
  order_type       varchar(16)   [not null] // MARKET (MVP)
  status           varchar(16)   [not null]
  time_in_force    varchar(16)   [not null] // DAY, etc.
  submitted_at     datetime      [not null]
  filled_at        datetime
}

Table executions {
  id               varchar(36)   [pk]
  order_id         varchar(36)   [not null]
  paper_account_id int           [not null]
  symbol_id        int           [not null]
  side             varchar(8)    [not null] // BUY | SELL
  quantity         decimal(18,8) [not null]
  price            decimal(18,8) [not null]
  executed_at      datetime      [not null]
}

Table positions {
  id               int           [pk]
  paper_account_id int           [not null]
  symbol_id        int           [not null]
  quantity         decimal(18,8) [not null]
  avg_cost         decimal(18,8) [not null]
  updated_at       datetime      [not null]

  indexes {
    (paper_account_id, symbol_id) [unique]
  }
}

// 4) Strategy lab

Table strategies {
  id           varchar(36)  [pk]
  user_id      varchar(36)  [not null]
  name         varchar(255) [not null]
  description  text
  asset_type   varchar(16)  [not null]
  symbol_scope varchar(16)  [not null]
  timeframe    varchar(8)   [not null]
  is_active    boolean      [not null]
  created_at   datetime     [not null]
  updated_at   datetime     [not null]
}

Table strategy_versions {
  id             int         [pk]
  strategy_id    varchar(36) [not null]
  version_number int         [not null]
  definition_json json       [not null]
  created_at     datetime    [not null]

  indexes {
    (strategy_id, version_number) [unique]
  }
}

// 5) Backtesting

Table backtest_runs {
  id                  varchar(36)   [pk]
  user_id             varchar(36)   [not null]
  strategy_id         varchar(36)   [not null]
  strategy_version_id int           [not null]
  symbol_id           int           [not null]
  timeframe           varchar(8)    [not null]
  start_date          datetime      [not null]
  end_date            datetime      [not null]
  initial_equity      decimal(18,2) [not null]
  status              varchar(16)   [not null]
  job_id              varchar(36)
  error_message       text
  created_at          datetime      [not null]
  updated_at          datetime      [not null]
  started_at          datetime
  finished_at         datetime
}

Table backtest_results {
  id               int           [pk]
  backtest_run_id  varchar(36)   [not null]
  total_return_pct decimal(9,4)  [not null]
  max_drawdown_pct decimal(9,4)  [not null]
  win_rate_pct     decimal(9,4)  [not null]
  trade_count      int           [not null]
  sharpe_ratio     decimal(9,4)
  created_at       datetime      [not null]
}

Table backtest_trades {
  id              int           [pk]
  backtest_run_id varchar(36)   [not null]
  symbol_id       int           [not null]
  entry_time      datetime      [not null]
  exit_time       datetime      [not null]
  side            varchar(8)    [not null]
  entry_price     decimal(18,8) [not null]
  exit_price      decimal(18,8) [not null]
  quantity        decimal(18,8) [not null]
  pnl_abs         decimal(18,8) [not null]
  pnl_pct         decimal(9,4)  [not null]
}

Table backtest_equity_points {
  id              int           [pk]
  backtest_run_id varchar(36)   [not null]
  ts              datetime      [not null]
  equity          decimal(18,2) [not null]
}

// 6) AI usage

Table ai_usage {
  id        int         [pk]
  user_id   varchar(36) [not null]
  date      date        [not null]
  calls     int         [not null]
}

// 7) Infra

Table jobs {
  id           varchar(36) [pk]
  job_type     varchar(32) [not null]
  user_id      varchar(36) [not null]
  payload_json json        [not null]
  status       varchar(16) [not null]
  error_message text
  created_at   datetime    [not null]
  started_at   datetime
  finished_at  datetime
}

Table audit_events {
  id           int         [pk]
  user_id      varchar(36)
  event_type   varchar(64) [not null]
  payload_json json        [not null]
  created_at   datetime    [not null]
}

// Relationships

Ref: paper_accounts.user_id > users.id
Ref: webauthn_credentials.user_id > users.id

Ref: orders.paper_account_id > paper_accounts.id
Ref: orders.symbol_id        > symbols.id

Ref: executions.order_id         > orders.id
Ref: executions.paper_account_id > paper_accounts.id
Ref: executions.symbol_id        > symbols.id

Ref: positions.paper_account_id > paper_accounts.id
Ref: positions.symbol_id        > symbols.id

Ref: equity_daily_bars.symbol_id  > symbols.id
Ref: crypto_daily_bars.symbol_id  > symbols.id
Ref: crypto_hourly_bars.symbol_id > symbols.id

Ref: strategies.user_id > users.id
Ref: strategy_versions.strategy_id > strategies.id

Ref: backtest_runs.user_id             > users.id
Ref: backtest_runs.strategy_id         > strategies.id
Ref: backtest_runs.strategy_version_id > strategy_versions.id
Ref: backtest_runs.symbol_id           > symbols.id
Ref: backtest_runs.job_id              > jobs.id

Ref: backtest_results.backtest_run_id       > backtest_runs.id
Ref: backtest_trades.backtest_run_id        > backtest_runs.id
Ref: backtest_equity_points.backtest_run_id > backtest_runs.id
Ref: backtest_trades.symbol_id              > symbols.id

Ref: ai_usage.user_id     > users.id
Ref: jobs.user_id         > users.id
Ref: audit_events.user_id > users.id
