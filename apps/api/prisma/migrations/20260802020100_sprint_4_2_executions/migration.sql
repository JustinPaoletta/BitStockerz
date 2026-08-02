-- Sprint 4.2 / conceptual V0403: one execution per filled market order.
CREATE TABLE `executions` (
  `id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `paper_account_id` INTEGER UNSIGNED NOT NULL,
  `symbol_id` INTEGER UNSIGNED NOT NULL,
  `side` VARCHAR(8) NOT NULL,
  `quantity` DECIMAL(18, 8) NOT NULL,
  `price` DECIMAL(18, 8) NOT NULL,
  `executed_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  KEY `idx_exec_account_time` (`paper_account_id`, `executed_at`),
  KEY `idx_exec_symbol_time` (`symbol_id`, `executed_at`),
  CONSTRAINT `fk_exec_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_exec_paper_account`
    FOREIGN KEY (`paper_account_id`) REFERENCES `paper_accounts` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_exec_symbol`
    FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;
