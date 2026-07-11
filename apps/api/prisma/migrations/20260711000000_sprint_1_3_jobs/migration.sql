CREATE TABLE `jobs` (
  `id` CHAR(36) NOT NULL,
  `job_type` VARCHAR(32) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `payload_json` JSON NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,

  INDEX `jobs_user_id_created_at_idx`(`user_id`, `created_at`),
  INDEX `jobs_job_type_status_idx`(`job_type`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `jobs`
  ADD CONSTRAINT `jobs_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT IGNORE INTO `users` (`id`, `email`, `created_at`, `updated_at`)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'system@bitstockerz.local',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
);
