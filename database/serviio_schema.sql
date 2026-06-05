-- ============================================================
-- SERVIIO MySQL Schema - Complete & Refined
-- Updated: June 4, 2026
-- Run: mysql -u root -p < serviio_schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS serviio_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE serviio_db;

-- ============================================================
-- 1. USERS TABLE: Stores all user profiles (customers, providers, admins)
-- Password uses VARCHAR(255) to safely store bcrypt hashes (salt=12)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
	id INT AUTO_INCREMENT PRIMARY KEY,
	first_name VARCHAR(100) NOT NULL,
	last_name VARCHAR(100) NOT NULL,
	email VARCHAR(255) NOT NULL UNIQUE,
	phone VARCHAR(20) DEFAULT NULL,
	password VARCHAR(255) NOT NULL,
	role ENUM('customer','provider','admin') DEFAULT 'customer',
	is_active BOOLEAN DEFAULT TRUE,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX idx_email (email),
	INDEX idx_role (role)
);

-- ============================================================
-- 2. PROVIDER PROFILES TABLE: Extended profile data for service providers
-- Links to users table with CASCADE delete
-- ============================================================
CREATE TABLE IF NOT EXISTS provider_profiles (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL UNIQUE,
	service_type VARCHAR(150) DEFAULT NULL,
	location VARCHAR(255) DEFAULT NULL,
	nid_number VARCHAR(20) DEFAULT NULL,
	is_verified BOOLEAN DEFAULT FALSE,
	experience_summary TEXT DEFAULT NULL,
	is_available BOOLEAN DEFAULT TRUE,
	hourly_rate DECIMAL(10, 2) DEFAULT NULL,
	total_reviews INT DEFAULT 0,
	average_rating DECIMAL(3, 2) DEFAULT 0,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX idx_service_type (service_type),
	INDEX idx_location (location(50)),
	INDEX idx_is_available (is_available)
);

-- ============================================================
-- 3. BOOKINGS TABLE: Core booking records with payment fields
-- Includes: handshake_code, status tracking, emergency flag, payment info
-- ============================================================
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
	payment_status ENUM('UNPAID','PAID','FAILED','REFUNDED') DEFAULT 'UNPAID',
	payment_transaction_id VARCHAR(100) DEFAULT NULL,
	payment_amount DECIMAL(10, 2) DEFAULT NULL,
	payment_date TIMESTAMP NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX idx_customer_id (customer_id),
	INDEX idx_provider_id (provider_id),
	INDEX idx_status (status),
	INDEX idx_payment_status (payment_status),
	INDEX idx_booking_date (booking_date)
);

-- ============================================================
-- 4. PAYMENT TRANSACTIONS TABLE: Audit trail for all payments
-- Separate table for comprehensive payment history tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_transactions (
	id INT AUTO_INCREMENT PRIMARY KEY,
	booking_id INT NOT NULL,
	customer_id INT NOT NULL,
	provider_id INT NOT NULL,
	transaction_id VARCHAR(100) NOT NULL UNIQUE,
	amount DECIMAL(10, 2) NOT NULL,
	status ENUM('PENDING','SUCCESS','FAILED','CANCELLED') DEFAULT 'PENDING',
	payment_method VARCHAR(50) DEFAULT 'mock',
	description TEXT DEFAULT NULL,
	error_message TEXT DEFAULT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
	FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX idx_booking_id (booking_id),
	INDEX idx_transaction_id (transaction_id),
	INDEX idx_customer_id (customer_id),
	INDEX idx_status (status)
);

-- ============================================================
-- 5. REVIEWS TABLE: Provider ratings and feedback from customers
-- Rating constraint: 1-5 scale
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
	id INT AUTO_INCREMENT PRIMARY KEY,
	booking_id INT DEFAULT NULL,
	provider_id INT NOT NULL,
	customer_id INT NOT NULL,
	rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
	title VARCHAR(255) DEFAULT NULL,
	comment TEXT DEFAULT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
	FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
	INDEX idx_provider_id (provider_id),
	INDEX idx_customer_id (customer_id),
	INDEX idx_rating (rating)
);

-- ============================================================
-- 6. EMERGENCY LOGS TABLE: SOS/emergency event tracking
-- For emergency service dispatch and incident logging
-- ============================================================
CREATE TABLE IF NOT EXISTS emergency_logs (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT DEFAULT NULL,
	booking_id INT DEFAULT NULL,
	emergency_type VARCHAR(100) DEFAULT NULL,
	message TEXT DEFAULT NULL,
	location VARCHAR(255) DEFAULT NULL,
	latitude DECIMAL(10, 8) DEFAULT NULL,
	longitude DECIMAL(11, 8) DEFAULT NULL,
	status ENUM('ACTIVE','RESOLVED','CANCELLED') DEFAULT 'ACTIVE',
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
	INDEX idx_user_id (user_id),
	INDEX idx_status (status),
	INDEX idx_created_at (created_at)
);

-- ============================================================
-- 7. NOTIFICATIONS TABLE: Audit trail for all notifications
-- For email, SMS, and in-app notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	booking_id INT DEFAULT NULL,
	notification_type VARCHAR(100) NOT NULL,
	title VARCHAR(255) DEFAULT NULL,
	message TEXT DEFAULT NULL,
	is_read BOOLEAN DEFAULT FALSE,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
	INDEX idx_user_id (user_id),
	INDEX idx_is_read (is_read),
	INDEX idx_created_at (created_at)
);

-- ============================================================
-- 8. AUDIT LOG TABLE: Track all critical system actions
-- For compliance, debugging, and admin investigation
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT DEFAULT NULL,
	action VARCHAR(100) NOT NULL,
	entity_type VARCHAR(100) NOT NULL,
	entity_id INT DEFAULT NULL,
	old_values JSON DEFAULT NULL,
	new_values JSON DEFAULT NULL,
	ip_address VARCHAR(45) DEFAULT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
	INDEX idx_action (action),
	INDEX idx_entity_type (entity_type),
	INDEX idx_created_at (created_at)
);

-- ============================================================
-- SUMMARY OF CHANGES (Latest Updates)
-- ============================================================
-- 1. Added payment fields to bookings table:
--    - payment_status (ENUM: UNPAID, PAID, FAILED, REFUNDED)
--    - payment_transaction_id (VARCHAR 100)
--    - payment_amount (DECIMAL 10,2)
--    - payment_date (TIMESTAMP)
--
-- 2. Created payment_transactions table for audit trail
--
-- 3. Enhanced provider_profiles table:
--    - Added hourly_rate, total_reviews, average_rating
--    - Added indexes for performance
--
-- 4. Added comprehensive indexes across all tables
--    - Optimizes: customer/provider lookups, status filtering, date ranges
--
-- 5. Added emergency_logs enhancements:
--    - Added latitude/longitude fields (DECIMAL precision for GPS)
--    - Added emergency_type and status tracking
--
-- 6. Added notifications table for in-app notification audit
--
-- 7. Added audit_logs table for compliance and debugging
--
-- 8. All tables use utf8mb4 for proper emoji/unicode support
-- ============================================================
