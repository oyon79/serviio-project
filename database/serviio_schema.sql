-- SERVIIO MySQL Schema (recommended starter)
-- Run: mysql -u root -p < serviio_schema.sql

CREATE DATABASE IF NOT EXISTS serviio_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE serviio_db;

-- Users table: password uses VARCHAR(255) to safely store bcrypt hashes
CREATE TABLE IF NOT EXISTS users (
	id INT AUTO_INCREMENT PRIMARY KEY,
	first_name VARCHAR(100) NOT NULL,
	last_name VARCHAR(100) NOT NULL,
	email VARCHAR(255) NOT NULL UNIQUE,
	phone VARCHAR(20) DEFAULT NULL,
	password VARCHAR(255) NOT NULL,
	role ENUM('customer','provider','admin') DEFAULT 'customer',
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Provider profile table
CREATE TABLE IF NOT EXISTS provider_profiles (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	service_type VARCHAR(150) DEFAULT NULL,
	location VARCHAR(255) DEFAULT NULL,
	nid_number VARCHAR(20) DEFAULT NULL,
	is_verified BOOLEAN DEFAULT FALSE,
	experience_summary TEXT DEFAULT NULL,
	is_available BOOLEAN DEFAULT TRUE,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Bookings table (includes handshake code and status)
CREATE TABLE IF NOT EXISTS bookings (
	id INT AUTO_INCREMENT PRIMARY KEY,
	customer_id INT NOT NULL,
	provider_id INT NOT NULL,
	service_type VARCHAR(150) DEFAULT NULL,
	job_location VARCHAR(255) DEFAULT NULL,
	booking_date DATETIME DEFAULT NULL,
	estimated_price_range VARCHAR(100) DEFAULT NULL,
	status ENUM('PENDING','IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'PENDING',
	handshake_code VARCHAR(10) DEFAULT NULL,
	is_emergency BOOLEAN DEFAULT FALSE,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Basic indexes for performance
CREATE INDEX idx_provider_location ON provider_profiles(location(50));
CREATE INDEX idx_bookings_status ON bookings(status);

-- Provider reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider_id INT NOT NULL,
    customer_id INT NOT NULL,
    rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(255) DEFAULT NULL,
    comment TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Emergency logs table for SOS fallback events
CREATE TABLE IF NOT EXISTS emergency_logs (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT DEFAULT NULL,
	booking_id INT DEFAULT NULL,
	message TEXT DEFAULT NULL,
	location VARCHAR(255) DEFAULT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);
