-- SERVIIO migration: review creation safeguards and feed indexes
-- Apply after database/serviio_schema.sql has created the base schema.

USE serviio_db;

ALTER TABLE reviews
	MODIFY COLUMN customer_id INT DEFAULT NULL,
	ADD UNIQUE KEY IF NOT EXISTS uniq_booking_review (booking_id),
	ADD INDEX IF NOT EXISTS idx_created_at (created_at);
