-- Opaque authentication identifiers are case-sensitive. Do not inherit the
-- case/accent-insensitive collation used by human-facing email/profile columns.
ALTER TABLE `auth_sessions`
  MODIFY COLUMN `token` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE `oauth_identities`
  MODIFY COLUMN `provider` VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY COLUMN `subject` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE `oauth_states`
  MODIFY COLUMN `state` VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY COLUMN `nonce` VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY COLUMN `code_challenge` CHAR(43) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  MODIFY COLUMN `initiating_session_hash` CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;

ALTER TABLE `oauth_handoffs`
  MODIFY COLUMN `code_hash` CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY COLUMN `provider` VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY COLUMN `subject` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  MODIFY COLUMN `code_challenge` CHAR(43) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY COLUMN `initiating_session_hash` CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;

ALTER TABLE `webauthn_credentials`
  MODIFY COLUMN `credential_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE `webauthn_challenges`
  MODIFY COLUMN `id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY COLUMN `challenge` VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
