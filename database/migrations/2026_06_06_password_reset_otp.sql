-- SERVIIO migration: password reset OTP and one-time token audit trail
-- Apply after database/serviio_schema.sql has created the users table.

USE serviio_db;

CREATE TABLE IF NOT EXISTS password_reset_requests (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	email VARCHAR(255) NOT NULL,
	reset_token_hash CHAR(64) NOT NULL UNIQUE,
	otp_hash VARCHAR(255) NOT NULL,
	channel ENUM('EMAIL','SMS','MANUAL') DEFAULT 'EMAIL',
	status ENUM('REQUESTED','USED','EXPIRED') DEFAULT 'REQUESTED',
	requested_ip VARCHAR(45) DEFAULT NULL,
	attempt_count INT DEFAULT 0,
	expires_at TIMESTAMP NOT NULL,
	used_at TIMESTAMP NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX idx_user_id (user_id),
	INDEX idx_email (email),
	INDEX idx_status (status),
	INDEX idx_expires_at (expires_at)
);
