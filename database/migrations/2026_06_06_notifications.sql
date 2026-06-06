-- SERVIIO migration: notification engine fields
-- Apply after database/serviio_schema.sql has created the base schema.

USE serviio_db;

ALTER TABLE notifications
	ADD COLUMN IF NOT EXISTS channel ENUM('IN_APP','EMAIL','SMS','WHATSAPP','PUSH') DEFAULT 'IN_APP' AFTER notification_type,
	ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100) DEFAULT NULL AFTER message,
	ADD COLUMN IF NOT EXISTS entity_id INT DEFAULT NULL AFTER entity_type,
	ADD COLUMN IF NOT EXISTS delivery_status ENUM('QUEUED','SENT','FAILED','READ') DEFAULT 'QUEUED' AFTER entity_id,
	ADD COLUMN IF NOT EXISTS read_at TIMESTAMP NULL AFTER created_at,
	ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER read_at,
	ADD INDEX IF NOT EXISTS idx_delivery_status (delivery_status),
	ADD INDEX IF NOT EXISTS idx_entity (entity_type, entity_id);
