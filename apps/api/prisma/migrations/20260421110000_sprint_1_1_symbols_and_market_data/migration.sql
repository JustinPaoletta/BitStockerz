CREATE TABLE `symbols` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `symbol` VARCHAR(32) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `asset_type` VARCHAR(16) NOT NULL,
  `exchange` VARCHAR(64) NULL,
  `currency` VARCHAR(16) NOT NULL,
  `base_asset` VARCHAR(32) NULL,
  `quote_asset` VARCHAR(32) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `symbols_symbol_key`(`symbol`),
  INDEX `symbols_asset_type_idx`(`asset_type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `equity_daily_bars` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `symbol_id` INT UNSIGNED NOT NULL,
  `date` DATE NOT NULL,
  `open` DECIMAL(18, 6) NOT NULL,
  `high` DECIMAL(18, 6) NOT NULL,
  `low` DECIMAL(18, 6) NOT NULL,
  `close` DECIMAL(18, 6) NOT NULL,
  `volume` BIGINT NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `equity_daily_bars_symbol_id_date_key`(`symbol_id`, `date`),
  INDEX `equity_daily_bars_symbol_id_date_idx`(`symbol_id`, `date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `crypto_daily_bars` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `symbol_id` INT UNSIGNED NOT NULL,
  `date` DATE NOT NULL,
  `open` DECIMAL(18, 6) NOT NULL,
  `high` DECIMAL(18, 6) NOT NULL,
  `low` DECIMAL(18, 6) NOT NULL,
  `close` DECIMAL(18, 6) NOT NULL,
  `volume` DECIMAL(24, 8) NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `crypto_daily_bars_symbol_id_date_key`(`symbol_id`, `date`),
  INDEX `crypto_daily_bars_symbol_id_date_idx`(`symbol_id`, `date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `crypto_hourly_bars` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `symbol_id` INT UNSIGNED NOT NULL,
  `ts` DATETIME(3) NOT NULL,
  `open` DECIMAL(18, 6) NOT NULL,
  `high` DECIMAL(18, 6) NOT NULL,
  `low` DECIMAL(18, 6) NOT NULL,
  `close` DECIMAL(18, 6) NOT NULL,
  `volume` DECIMAL(24, 8) NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `crypto_hourly_bars_symbol_id_ts_key`(`symbol_id`, `ts`),
  INDEX `crypto_hourly_bars_symbol_id_ts_idx`(`symbol_id`, `ts`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `equity_daily_bars`
  ADD CONSTRAINT `equity_daily_bars_symbol_id_fkey`
  FOREIGN KEY (`symbol_id`) REFERENCES `symbols`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `crypto_daily_bars`
  ADD CONSTRAINT `crypto_daily_bars_symbol_id_fkey`
  FOREIGN KEY (`symbol_id`) REFERENCES `symbols`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `crypto_hourly_bars`
  ADD CONSTRAINT `crypto_hourly_bars_symbol_id_fkey`
  FOREIGN KEY (`symbol_id`) REFERENCES `symbols`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
