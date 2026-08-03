-- Sprint 4.1 / conceptual V0400: one paper account per user.
CREATE TABLE `paper_accounts` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `base_currency` VARCHAR(16) NOT NULL,
  `starting_balance` DECIMAL(18, 2) NOT NULL,
  `cash_balance` DECIMAL(18, 2) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_paper_account_user` (`user_id`),
  CONSTRAINT `fk_paper_account_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;
