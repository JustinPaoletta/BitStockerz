ALTER TABLE `oauth_states`
  ADD COLUMN `mode` VARCHAR(16) NOT NULL DEFAULT 'json',
  ADD COLUMN `intent` VARCHAR(16) NOT NULL DEFAULT 'login',
  ADD COLUMN `code_challenge` CHAR(43) NULL,
  ADD COLUMN `return_path` VARCHAR(2048) NULL,
  ADD COLUMN `initiating_user_id` CHAR(36) NULL,
  ADD COLUMN `initiating_session_hash` CHAR(64) NULL;
CREATE UNIQUE INDEX `oauth_identities_user_id_provider_key` ON `oauth_identities` (`user_id`, `provider`);
CREATE TABLE `oauth_handoffs` (
  `code_hash` CHAR(64) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `provider` VARCHAR(16) NOT NULL,
  `intent` VARCHAR(16) NOT NULL,
  `subject` VARCHAR(255) NULL,
  `email` VARCHAR(191) NULL,
  `code_challenge` CHAR(43) NOT NULL,
  `return_path` VARCHAR(2048) NOT NULL,
  `initiating_session_hash` CHAR(64) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  INDEX `oauth_handoffs_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`code_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
