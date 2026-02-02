-- BitStockerz DDL Skeletons – 00_core.sql
-- Core identity tables

CREATE TABLE users (
  id            CHAR(36)     NOT NULL,
  email         VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NOT NULL,
  deleted_at    DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE webauthn_credentials (
  credential_id VARCHAR(255) NOT NULL,
  user_id       CHAR(36)     NOT NULL,
  public_key    TEXT         NOT NULL,
  sign_count    BIGINT       NOT NULL,
  transports    VARCHAR(255) NULL,
  aaguid        VARCHAR(36)  NULL,
  created_at    DATETIME     NOT NULL,
  PRIMARY KEY (credential_id),
  KEY idx_webauthn_credentials_user_id (user_id),
  CONSTRAINT fk_webauthn_credentials_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
