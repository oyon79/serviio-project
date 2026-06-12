-- SERVIIO migration: password reset may be delivered through email and SMS.

USE serviio_db;

ALTER TABLE password_reset_requests
	MODIFY COLUMN channel ENUM('EMAIL','SMS','EMAIL_SMS','MANUAL') DEFAULT 'EMAIL';
