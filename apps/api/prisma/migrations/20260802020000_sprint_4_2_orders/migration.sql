-- Sprint 4.2 / conceptual V0402: synchronous market orders.
CREATE TABLE `orders` (
  `id` CHAR(36) NOT NULL,
  `paper_account_id` INTEGER UNSIGNED NOT NULL,
  `symbol_id` INTEGER UNSIGNED NOT NULL,
  `side` VARCHAR(8) NOT NULL,
  `quantity` DECIMAL(18, 8) NOT NULL,
  `order_type` VARCHAR(16) NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `avg_fill_price` DECIMAL(18, 8) NULL,
  `reject_reason` VARCHAR(255) NULL,
  `client_order_id` VARCHAR(64) NULL,
  `requested_at` DATETIME(3) NOT NULL,
  `filled_at` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  KEY `idx_orders_account_requested` (`paper_account_id`, `requested_at`),
  UNIQUE KEY `uq_orders_account_client` (`paper_account_id`, `client_order_id`),
  KEY `idx_orders_symbol` (`symbol_id`),
  CONSTRAINT `fk_orders_paper_account`
    FOREIGN KEY (`paper_account_id`) REFERENCES `paper_accounts` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_orders_symbol`
    FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;
