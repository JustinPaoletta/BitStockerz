-- Sprint 4.1 / conceptual V0401: long-only positions by account and symbol.
CREATE TABLE `positions` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `paper_account_id` INTEGER UNSIGNED NOT NULL,
  `symbol_id` INTEGER UNSIGNED NOT NULL,
  `quantity` DECIMAL(18, 8) NOT NULL,
  `avg_cost` DECIMAL(18, 8) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_positions_account_symbol` (`paper_account_id`, `symbol_id`),
  KEY `idx_positions_account` (`paper_account_id`),
  KEY `idx_positions_symbol` (`symbol_id`),
  CONSTRAINT `fk_positions_paper_account`
    FOREIGN KEY (`paper_account_id`) REFERENCES `paper_accounts` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_positions_symbol`
    FOREIGN KEY (`symbol_id`) REFERENCES `symbols` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;
