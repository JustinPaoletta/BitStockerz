ALTER TABLE `webauthn_challenges`
  ADD COLUMN `invitation_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL;

CREATE TABLE `mobile_invitations` (
  `token_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `consumed_at` DATETIME(3) NULL,
  `consumed_by` CHAR(36) NULL,
  `revoked_at` DATETIME(3) NULL,
  INDEX `mobile_invitations_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`token_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `mobile_admissions` (
  `user_id` CHAR(36) NOT NULL,
  `admitted_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `mobile_admissions_user_id_fkey` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
