CREATE TABLE `users` (
  `id` varchar(36) PRIMARY KEY,
  `email` varchar(255) UNIQUE NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime
);

CREATE TABLE `symbols` (
  `id` int PRIMARY KEY,
  `symbol` varchar(32) UNIQUE NOT NULL,
  `name` varchar(255) NOT NULL,
  `asset_type` varchar(16) NOT NULL,
  `exchange` varchar(64),
  `currency` varchar(16) NOT NULL,
  `base_asset` varchar(32),
  `quote_asset` varchar(32),
  `is_active` boolean NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
);

CREATE TABLE `equity_daily_bars` (
  `id` int PRIMARY KEY,
  `symbol_id` int NOT NULL,
  `date` date NOT NULL,
  `open` decimal(18,6) NOT NULL,
  `high` decimal(18,6) NOT NULL,
  `low` decimal(18,6) NOT NULL,
  `close` decimal(18,6) NOT NULL,
  `volume` decimal(24,8) NOT NULL,
  `provider` varchar(64) NOT NULL,
  `created_at` datetime NOT NULL
);

CREATE TABLE `crypto_daily_bars` (
  `id` int PRIMARY KEY,
  `symbol_id` int NOT NULL,
  `date` date NOT NULL,
  `open` decimal(18,6) NOT NULL,
  `high` decimal(18,6) NOT NULL,
  `low` decimal(18,6) NOT NULL,
  `close` decimal(18,6) NOT NULL,
  `volume` decimal(24,8) NOT NULL,
  `provider` varchar(64) NOT NULL,
  `created_at` datetime NOT NULL
);

CREATE TABLE `crypto_hourly_bars` (
  `id` int PRIMARY KEY,
  `symbol_id` int NOT NULL,
  `ts` datetime NOT NULL,
  `open` decimal(18,6) NOT NULL,
  `high` decimal(18,6) NOT NULL,
  `low` decimal(18,6) NOT NULL,
  `close` decimal(18,6) NOT NULL,
  `volume` decimal(24,8) NOT NULL,
  `provider` varchar(64) NOT NULL,
  `created_at` datetime NOT NULL
);

CREATE TABLE `paper_accounts` (
  `id` int PRIMARY KEY,
  `user_id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `base_currency` varchar(16) NOT NULL,
  `starting_balance` decimal(18,2) NOT NULL,
  `cash_balance` decimal(18,2) NOT NULL,
  `is_active` boolean NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
);

CREATE TABLE `orders` (
  `id` varchar(36) PRIMARY KEY,
  `paper_account_id` int NOT NULL,
  `symbol_id` int NOT NULL,
  `side` varchar(8) NOT NULL,
  `quantity` decimal(18,8) NOT NULL,
  `order_type` varchar(16) NOT NULL,
  `status` varchar(16) NOT NULL,
  `time_in_force` varchar(16) NOT NULL,
  `submitted_at` datetime NOT NULL,
  `filled_at` datetime
);

CREATE TABLE `executions` (
  `id` varchar(36) PRIMARY KEY,
  `order_id` varchar(36) NOT NULL,
  `paper_account_id` int NOT NULL,
  `symbol_id` int NOT NULL,
  `side` varchar(8) NOT NULL,
  `quantity` decimal(18,8) NOT NULL,
  `price` decimal(18,8) NOT NULL,
  `executed_at` datetime NOT NULL
);

CREATE TABLE `positions` (
  `id` int PRIMARY KEY,
  `paper_account_id` int NOT NULL,
  `symbol_id` int NOT NULL,
  `quantity` decimal(18,8) NOT NULL,
  `avg_cost` decimal(18,8) NOT NULL,
  `updated_at` datetime NOT NULL
);

CREATE TABLE `strategies` (
  `id` varchar(36) PRIMARY KEY,
  `user_id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `asset_type` varchar(16) NOT NULL,
  `symbol_scope` varchar(16) NOT NULL,
  `timeframe` varchar(8) NOT NULL,
  `is_active` boolean NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
);

CREATE TABLE `strategy_versions` (
  `id` int PRIMARY KEY,
  `strategy_id` varchar(36) NOT NULL,
  `version_number` int NOT NULL,
  `definition_json` json NOT NULL,
  `created_at` datetime NOT NULL
);

CREATE TABLE `backtest_runs` (
  `id` varchar(36) PRIMARY KEY,
  `user_id` varchar(36) NOT NULL,
  `strategy_id` varchar(36) NOT NULL,
  `strategy_version_id` int NOT NULL,
  `symbol_id` int NOT NULL,
  `timeframe` varchar(8) NOT NULL,
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `initial_equity` decimal(18,2) NOT NULL,
  `status` varchar(16) NOT NULL,
  `job_id` varchar(36),
  `error_message` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `started_at` datetime,
  `finished_at` datetime
);

CREATE TABLE `backtest_results` (
  `id` int PRIMARY KEY,
  `backtest_run_id` varchar(36) NOT NULL,
  `total_return_pct` decimal(9,4) NOT NULL,
  `max_drawdown_pct` decimal(9,4) NOT NULL,
  `win_rate_pct` decimal(9,4) NOT NULL,
  `trade_count` int NOT NULL,
  `sharpe_ratio` decimal(9,4),
  `created_at` datetime NOT NULL
);

CREATE TABLE `backtest_trades` (
  `id` int PRIMARY KEY,
  `backtest_run_id` varchar(36) NOT NULL,
  `symbol_id` int NOT NULL,
  `entry_time` datetime NOT NULL,
  `exit_time` datetime NOT NULL,
  `side` varchar(8) NOT NULL,
  `entry_price` decimal(18,8) NOT NULL,
  `exit_price` decimal(18,8) NOT NULL,
  `quantity` decimal(18,8) NOT NULL,
  `pnl_abs` decimal(18,8) NOT NULL,
  `pnl_pct` decimal(9,4) NOT NULL
);

CREATE TABLE `backtest_equity_points` (
  `id` int PRIMARY KEY,
  `backtest_run_id` varchar(36) NOT NULL,
  `ts` datetime NOT NULL,
  `equity` decimal(18,2) NOT NULL
);

CREATE TABLE `ai_usage` (
  `id` int PRIMARY KEY,
  `user_id` varchar(36) NOT NULL,
  `date` date NOT NULL,
  `calls` int NOT NULL
);

CREATE TABLE `jobs` (
  `id` varchar(36) PRIMARY KEY,
  `job_type` varchar(32) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `payload_json` json NOT NULL,
  `status` varchar(16) NOT NULL,
  `error_message` text,
  `created_at` datetime NOT NULL,
  `started_at` datetime,
  `finished_at` datetime
);

CREATE TABLE `audit_events` (
  `id` int PRIMARY KEY,
  `user_id` varchar(36),
  `event_type` varchar(64) NOT NULL,
  `payload_json` json NOT NULL,
  `created_at` datetime NOT NULL
);

CREATE UNIQUE INDEX `equity_daily_bars_index_0` ON `equity_daily_bars` (`symbol_id`, `date`);

CREATE UNIQUE INDEX `crypto_daily_bars_index_1` ON `crypto_daily_bars` (`symbol_id`, `date`);

CREATE UNIQUE INDEX `crypto_hourly_bars_index_2` ON `crypto_hourly_bars` (`symbol_id`, `ts`);

CREATE UNIQUE INDEX `positions_index_3` ON `positions` (`paper_account_id`, `symbol_id`);

CREATE UNIQUE INDEX `strategy_versions_index_4` ON `strategy_versions` (`strategy_id`, `version_number`);

ALTER TABLE `paper_accounts` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `orders` ADD FOREIGN KEY (`paper_account_id`) REFERENCES `paper_accounts` (`id`);

ALTER TABLE `orders` ADD FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`);

ALTER TABLE `executions` ADD FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`);

ALTER TABLE `executions` ADD FOREIGN KEY (`paper_account_id`) REFERENCES `paper_accounts` (`id`);

ALTER TABLE `executions` ADD FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`);

ALTER TABLE `positions` ADD FOREIGN KEY (`paper_account_id`) REFERENCES `paper_accounts` (`id`);

ALTER TABLE `positions` ADD FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`);

ALTER TABLE `equity_daily_bars` ADD FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`);

ALTER TABLE `crypto_daily_bars` ADD FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`);

ALTER TABLE `crypto_hourly_bars` ADD FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`);

ALTER TABLE `strategies` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `strategy_versions` ADD FOREIGN KEY (`strategy_id`) REFERENCES `strategies` (`id`);

ALTER TABLE `backtest_runs` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `backtest_runs` ADD FOREIGN KEY (`strategy_id`) REFERENCES `strategies` (`id`);

ALTER TABLE `backtest_runs` ADD FOREIGN KEY (`strategy_version_id`) REFERENCES `strategy_versions` (`id`);

ALTER TABLE `backtest_runs` ADD FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`);

ALTER TABLE `backtest_runs` ADD FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`);

ALTER TABLE `backtest_results` ADD FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`);

ALTER TABLE `backtest_trades` ADD FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`);

ALTER TABLE `backtest_equity_points` ADD FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`);

ALTER TABLE `backtest_trades` ADD FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`);

ALTER TABLE `ai_usage` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `jobs` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `audit_events` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
