ALTER TABLE `webauthn_challenges` ADD COLUMN `user_id` CHAR(36) NULL, ADD COLUMN `session_hash` CHAR(64) NULL;
