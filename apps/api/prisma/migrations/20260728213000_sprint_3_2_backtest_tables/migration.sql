-- Sprint 3.2: conceptual V0300-V0303.
-- Create backtest runs, results, trades, and equity points. The nullable
-- job_id column is created here; its jobs FK is added by the next migration.
CREATE TABLE `backtest_runs` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `strategy_id` CHAR(36) NOT NULL,
  `strategy_version_id` INTEGER UNSIGNED NOT NULL,
  `symbol_id` INTEGER UNSIGNED NOT NULL,
  `timeframe` VARCHAR(8) NOT NULL,
  `start_date` DATETIME(3) NOT NULL,
  `end_date` DATETIME(3) NOT NULL,
  `initial_equity` DECIMAL(18, 2) NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `job_id` CHAR(36) NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  KEY `idx_backtests_user_created` (`user_id`, `created_at`),
  KEY `idx_backtests_strategy` (`strategy_id`),
  KEY `idx_backtests_symbol` (`symbol_id`),
  CONSTRAINT `fk_backtest_runs_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_backtest_runs_strategy`
    FOREIGN KEY (`strategy_id`) REFERENCES `strategies` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_backtest_runs_strategy_version`
    FOREIGN KEY (`strategy_version_id`) REFERENCES `strategy_versions` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_backtest_runs_symbol`
    FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;

CREATE TABLE `backtest_results` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `backtest_run_id` CHAR(36) NOT NULL,
  `final_equity` DECIMAL(18, 2) NOT NULL,
  `total_return_pct` DECIMAL(9, 4) NOT NULL,
  `max_drawdown_pct` DECIMAL(9, 4) NOT NULL,
  `win_rate_pct` DECIMAL(9, 4) NOT NULL,
  `num_trades` INTEGER NOT NULL,
  `avg_win_pct` DECIMAL(9, 4) NOT NULL,
  `avg_loss_pct` DECIMAL(9, 4) NOT NULL,
  `sharpe_ratio` DECIMAL(9, 4) NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_backtest_results_run` (`backtest_run_id`),
  CONSTRAINT `fk_backtest_results_run`
    FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;

CREATE TABLE `backtest_trades` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `backtest_run_id` CHAR(36) NOT NULL,
  `symbol_id` INTEGER UNSIGNED NOT NULL,
  `entry_time` DATETIME(3) NOT NULL,
  `exit_time` DATETIME(3) NOT NULL,
  `side` VARCHAR(8) NOT NULL,
  `entry_price` DECIMAL(18, 8) NOT NULL,
  `exit_price` DECIMAL(18, 8) NOT NULL,
  `quantity` DECIMAL(18, 8) NOT NULL,
  `pnl_abs` DECIMAL(18, 8) NOT NULL,
  `pnl_pct` DECIMAL(9, 4) NOT NULL,

  PRIMARY KEY (`id`),
  KEY `idx_backtest_trades_run_entry` (`backtest_run_id`, `entry_time`),
  KEY `idx_backtest_trades_symbol` (`symbol_id`),
  CONSTRAINT `fk_backtest_trades_run`
    FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_backtest_trades_symbol`
    FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;

CREATE TABLE `backtest_equity_points` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `backtest_run_id` CHAR(36) NOT NULL,
  `ts` DATETIME(3) NOT NULL,
  `equity` DECIMAL(18, 2) NOT NULL,

  PRIMARY KEY (`id`),
  KEY `idx_backtest_equity_run_ts` (`backtest_run_id`, `ts`),
  CONSTRAINT `fk_backtest_equity_run`
    FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;
