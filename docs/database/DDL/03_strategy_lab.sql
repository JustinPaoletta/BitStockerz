-- BitStockerz DDL Skeletons – 03_strategy_lab.sql
-- Strategy Lab: strategies and versions

CREATE TABLE strategies (
  id           CHAR(36)     NOT NULL,
  user_id      CHAR(36)     NOT NULL,
  name         VARCHAR(255) NOT NULL,
  description  TEXT         NULL,
  asset_type   VARCHAR(16)  NOT NULL,
  symbol_scope VARCHAR(16)  NOT NULL,
  timeframe    VARCHAR(8)   NOT NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL,
  updated_at   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_strategies_user_name (user_id, name),
  KEY idx_strategies_user (user_id),
  CONSTRAINT fk_strategies_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE strategy_versions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  strategy_id    CHAR(36)     NOT NULL,
  version_number INT          NOT NULL,
  definition_json JSON        NOT NULL,
  created_at     DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_strategy_versions (strategy_id, version_number),
  KEY idx_strategy_versions_strategy (strategy_id),
  CONSTRAINT fk_strategy_versions_strategy
    FOREIGN KEY (strategy_id) REFERENCES strategies(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
