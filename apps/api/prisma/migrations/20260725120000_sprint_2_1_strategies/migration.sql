-- Sprint 2.1: strategy metadata and immutable strategy definitions.
CREATE TABLE `strategies` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `asset_type` VARCHAR(16) NOT NULL,
  `symbol_scope` VARCHAR(16) NOT NULL,
  `timeframe` VARCHAR(8) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_strategies_user_name` (`user_id`, `name`),
  KEY `idx_strategies_user` (`user_id`),
  CONSTRAINT `fk_strategies_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;

CREATE TABLE `strategy_versions` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `strategy_id` CHAR(36) NOT NULL,
  `version_number` INTEGER NOT NULL,
  `definition_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_strategy_versions` (`strategy_id`, `version_number`),
  KEY `idx_strategy_versions_strategy` (`strategy_id`),
  CONSTRAINT `fk_strategy_versions_strategy`
    FOREIGN KEY (`strategy_id`) REFERENCES `strategies` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;
