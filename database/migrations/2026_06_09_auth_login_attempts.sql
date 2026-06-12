-- Persistent login throttling table.
-- Apply after database/serviio_schema.sql on existing installations.

USE serviio_db;

CREATE TABLE IF NOT EXISTS auth_login_attempts (
	id INT AUTO_INCREMENT PRIMARY KEY,
	email VARCHAR(255) NOT NULL,
	ip_address VARCHAR(45) NOT NULL,
	attempt_count INT DEFAULT 0,
	locked_until TIMESTAMP NULL,
	last_attempt_at TIMESTAMP NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	UNIQUE KEY uniq_auth_attempt_email_ip (email, ip_address),
	INDEX idx_email (email),
	INDEX idx_locked_until (locked_until),
	INDEX idx_last_attempt_at (last_attempt_at)
);
