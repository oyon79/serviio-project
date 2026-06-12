-- Persist provider last known location for tracking and admin visibility.

USE serviio_db;

CREATE TABLE IF NOT EXISTS provider_locations (
	provider_id INT PRIMARY KEY,
	booking_id INT DEFAULT NULL,
	latitude DECIMAL(10, 8) NOT NULL,
	longitude DECIMAL(11, 8) NOT NULL,
	bearing DECIMAL(8, 2) DEFAULT NULL,
	speed DECIMAL(8, 2) DEFAULT NULL,
	accuracy DECIMAL(8, 2) DEFAULT NULL,
	last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
	INDEX idx_booking_id (booking_id),
	INDEX idx_last_seen_at (last_seen_at)
);
