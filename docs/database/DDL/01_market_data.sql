-- BitStockerz DDL Skeletons – 01_market_data.sql
-- Market data & reference tables

CREATE TABLE symbols (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  symbol      VARCHAR(32)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  asset_type  VARCHAR(16)  NOT NULL, -- EQUITY | CRYPTO
  exchange    VARCHAR(64)  NULL,
  currency    VARCHAR(16)  NOT NULL,
  base_asset  VARCHAR(32)  NULL,
  quote_asset VARCHAR(32)  NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_symbols_symbol (symbol),
  KEY idx_symbols_asset_type (asset_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE equity_daily_bars (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  symbol_id  INT UNSIGNED NOT NULL,
  date       DATE         NOT NULL,
  open       DECIMAL(18,6) NOT NULL,
  high       DECIMAL(18,6) NOT NULL,
  low        DECIMAL(18,6) NOT NULL,
  close      DECIMAL(18,6) NOT NULL,
  volume     BIGINT       NOT NULL,
  provider   VARCHAR(64)  NOT NULL,
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_equity_daily_symbol_date (symbol_id, date),
  KEY idx_equity_daily_symbol_date (symbol_id, date),
  CONSTRAINT fk_equity_daily_symbol
    FOREIGN KEY (symbol_id) REFERENCES symbols(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE crypto_daily_bars (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  symbol_id  INT UNSIGNED NOT NULL,
  date       DATE         NOT NULL,
  open       DECIMAL(18,6) NOT NULL,
  high       DECIMAL(18,6) NOT NULL,
  low        DECIMAL(18,6) NOT NULL,
  close      DECIMAL(18,6) NOT NULL,
  volume     DECIMAL(24,8) NOT NULL,
  provider   VARCHAR(64)  NOT NULL,
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crypto_daily_symbol_date (symbol_id, date),
  KEY idx_crypto_daily_symbol_date (symbol_id, date),
  CONSTRAINT fk_crypto_daily_symbol
    FOREIGN KEY (symbol_id) REFERENCES symbols(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE crypto_hourly_bars (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  symbol_id  INT UNSIGNED NOT NULL,
  ts         DATETIME     NOT NULL,
  open       DECIMAL(18,6) NOT NULL,
  high       DECIMAL(18,6) NOT NULL,
  low        DECIMAL(18,6) NOT NULL,
  close      DECIMAL(18,6) NOT NULL,
  volume     DECIMAL(24,8) NOT NULL,
  provider   VARCHAR(64)  NOT NULL,
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crypto_hourly_symbol_ts (symbol_id, ts),
  KEY idx_crypto_hourly_symbol_ts (symbol_id, ts),
  CONSTRAINT fk_crypto_hourly_symbol
    FOREIGN KEY (symbol_id) REFERENCES symbols(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
