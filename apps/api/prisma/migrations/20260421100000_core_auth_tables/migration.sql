CREATE TABLE `users` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `users_email_key`(`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `webauthn_credentials` (
  `credential_id` VARCHAR(255) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `public_key` TEXT NOT NULL,
  `sign_count` BIGINT NOT NULL,
  `transports` VARCHAR(191) NULL,
  `aaguid` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL,

  INDEX `webauthn_credentials_user_id_idx`(`user_id`),
  PRIMARY KEY (`credential_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `webauthn_credentials`
  ADD CONSTRAINT `webauthn_credentials_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
