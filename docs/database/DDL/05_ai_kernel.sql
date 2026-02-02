-- BitStockerz DDL Skeletons – 05_ai_kernel.sql
-- AI / Kernel support tables

CREATE TABLE ai_usage (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id   CHAR(36)     NOT NULL,
  date      DATE         NOT NULL,
  calls     INT          NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_usage_user_date (user_id, date),
  CONSTRAINT fk_ai_usage_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
