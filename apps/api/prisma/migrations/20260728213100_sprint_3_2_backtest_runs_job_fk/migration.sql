-- Sprint 3.2: conceptual V0330.
-- Add this FK after both backtest_runs and the Sprint 1.3 jobs table exist.
ALTER TABLE `backtest_runs`
  ADD CONSTRAINT `fk_backtest_runs_job`
  FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
