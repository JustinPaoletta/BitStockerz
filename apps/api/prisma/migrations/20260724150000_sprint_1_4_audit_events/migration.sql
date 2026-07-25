CREATE TABLE `audit_events` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` CHAR(36) NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `payload_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL,

  INDEX `audit_events_user_id_created_at_idx`(`user_id`, `created_at`),
  INDEX `audit_events_event_type_created_at_idx`(`event_type`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `audit_events`
  ADD CONSTRAINT `audit_events_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
