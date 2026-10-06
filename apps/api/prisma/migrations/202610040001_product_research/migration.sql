ALTER TABLE `backtest_runs` ADD COLUMN `simulation_json` JSON NULL;
ALTER TABLE `backtest_trades` ADD COLUMN `fees_abs` DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE `backtest_results` ADD COLUMN `benchmark_json` JSON NULL;
