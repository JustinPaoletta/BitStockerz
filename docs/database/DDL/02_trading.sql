-- BitStockerz DDL Skeletons – 02_trading.sql
-- Paper trading: accounts, orders, executions, positions

CREATE TABLE paper_accounts (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          CHAR(36)     NOT NULL,
  name             VARCHAR(255) NOT NULL,
  base_currency    VARCHAR(16)  NOT NULL,
  starting_balance DECIMAL(18,2) NOT NULL,
  cash_balance     DECIMAL(18,2) NOT NULL,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL,
  updated_at       DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_paper_account_user (user_id),
  CONSTRAINT fk_paper_account_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id               CHAR(36)     NOT NULL,
  paper_account_id INT UNSIGNED NOT NULL,
  symbol_id        INT UNSIGNED NOT NULL,
  side             VARCHAR(8)   NOT NULL,
  quantity         DECIMAL(18,8) NOT NULL,
  order_type       VARCHAR(16)  NOT NULL,
  status           VARCHAR(16)  NOT NULL,
  avg_fill_price   DECIMAL(18,8) NULL,
  reject_reason    VARCHAR(255) NULL,
  client_order_id  VARCHAR(64)  NULL,
  requested_at     DATETIME     NOT NULL,
  filled_at        DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_orders_account_requested (paper_account_id, requested_at),
  UNIQUE KEY uq_orders_account_client (paper_account_id, client_order_id),
  KEY idx_orders_symbol (symbol_id),
  CONSTRAINT fk_orders_paper_account
    FOREIGN KEY (paper_account_id) REFERENCES paper_accounts(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_orders_symbol
    FOREIGN KEY (symbol_id) REFERENCES symbols(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE executions (
  id               CHAR(36)     NOT NULL,
  order_id         CHAR(36)     NOT NULL,
  paper_account_id INT UNSIGNED NOT NULL,
  symbol_id        INT UNSIGNED NOT NULL,
  side             VARCHAR(8)   NOT NULL,
  quantity         DECIMAL(18,8) NOT NULL,
  price            DECIMAL(18,8) NOT NULL,
  executed_at      DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_exec_account_time (paper_account_id, executed_at),
  KEY idx_exec_symbol_time (symbol_id, executed_at),
  CONSTRAINT fk_exec_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_exec_paper_account
    FOREIGN KEY (paper_account_id) REFERENCES paper_accounts(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_exec_symbol
    FOREIGN KEY (symbol_id) REFERENCES symbols(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE positions (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  paper_account_id INT UNSIGNED NOT NULL,
  symbol_id        INT UNSIGNED NOT NULL,
  quantity         DECIMAL(18,8) NOT NULL,
  avg_cost         DECIMAL(18,8) NOT NULL,
  updated_at       DATETIME      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_positions_account_symbol (paper_account_id, symbol_id),
  KEY idx_positions_account (paper_account_id),
  KEY idx_positions_symbol (symbol_id),
  CONSTRAINT fk_positions_paper_account
    FOREIGN KEY (paper_account_id) REFERENCES paper_accounts(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_positions_symbol
    FOREIGN KEY (symbol_id) REFERENCES symbols(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
