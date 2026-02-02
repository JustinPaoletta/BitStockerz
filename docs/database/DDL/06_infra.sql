-- BitStockerz DDL Skeletons – 06_infra.sql
-- Infrastructure: jobs & audit events

CREATE TABLE jobs (
  id            CHAR(36)     NOT NULL,
  job_type      VARCHAR(32)  NOT NULL,
  user_id       CHAR(36)     NOT NULL,
  payload_json  JSON         NOT NULL,
  status        VARCHAR(16)  NOT NULL,
  error_message TEXT         NULL,
  created_at    DATETIME     NOT NULL,
  started_at    DATETIME     NULL,
  finished_at   DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_jobs_user_created (user_id, created_at),
  KEY idx_jobs_type_status (job_type, status),
  CONSTRAINT fk_jobs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_events (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      CHAR(36)     NULL,
  event_type   VARCHAR(64)  NOT NULL,
  payload_json JSON         NOT NULL,
  created_at   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_audit_user_created (user_id, created_at),
  KEY idx_audit_type_created (event_type, created_at),
  CONSTRAINT fk_audit_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
