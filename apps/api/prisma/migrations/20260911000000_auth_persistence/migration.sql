ALTER TABLE `users`
  ADD COLUMN `display_name` VARCHAR(255) NULL,
  ADD COLUMN `base_currency` VARCHAR(8) NOT NULL DEFAULT 'USD';

CREATE TABLE `auth_sessions` (
  `token` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,

  INDEX `auth_sessions_user_id_idx`(`user_id`),
  INDEX `auth_sessions_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `oauth_identities` (
  `provider` VARCHAR(16) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `email` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL,

  INDEX `oauth_identities_user_id_idx`(`user_id`),
  PRIMARY KEY (`provider`, `subject`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `webauthn_challenges` (
  `id` CHAR(36) NOT NULL,
  `purpose` VARCHAR(16) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `challenge` VARCHAR(512) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,

  INDEX `webauthn_challenges_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `oauth_states` (
  `state` VARCHAR(128) NOT NULL,
  `provider` VARCHAR(16) NOT NULL,
  `nonce` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,

  INDEX `oauth_states_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`state`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `auth_sessions`
  ADD CONSTRAINT `auth_sessions_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `oauth_identities`
  ADD CONSTRAINT `oauth_identities_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
