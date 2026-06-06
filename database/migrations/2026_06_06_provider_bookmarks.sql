-- SERVIIO migration: customer saved providers and rebooking support
-- Apply after database/serviio_schema.sql has created users and provider profiles.

USE serviio_db;

CREATE TABLE IF NOT EXISTS provider_bookmarks (
	id INT AUTO_INCREMENT PRIMARY KEY,
	customer_id INT NOT NULL,
	provider_id INT NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
	UNIQUE KEY uniq_customer_provider_bookmark (customer_id, provider_id),
	INDEX idx_customer_id (customer_id),
	INDEX idx_provider_id (provider_id),
	INDEX idx_created_at (created_at)
);
