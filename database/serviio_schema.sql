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
	role ENUM('customer','provider','admin','super_admin','support_agent','verification_officer') DEFAULT 'customer',
	is_active BOOLEAN DEFAULT TRUE,
	account_verified BOOLEAN DEFAULT TRUE,
	email_verified_at TIMESTAMP NULL,
	phone_verified_at TIMESTAMP NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX idx_email (email),
	INDEX idx_role (role),
	INDEX idx_account_verified (account_verified)
);

-- ============================================================
-- 2. PASSWORD RESET REQUESTS TABLE: OTP/token recovery audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_requests (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	email VARCHAR(255) NOT NULL,
	reset_token_hash CHAR(64) NOT NULL UNIQUE,
	otp_hash VARCHAR(255) NOT NULL,
	channel ENUM('EMAIL','SMS','EMAIL_SMS','MANUAL') DEFAULT 'EMAIL',
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

-- ============================================================
-- 2B. AUTH LOGIN ATTEMPTS TABLE: Persistent brute-force lockout
-- ============================================================
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

-- ============================================================
-- 2C. REGISTRATION VERIFICATION REQUESTS TABLE: Account OTP onboarding
-- ============================================================
CREATE TABLE IF NOT EXISTS registration_verification_requests (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	email VARCHAR(255) NOT NULL,
	phone VARCHAR(20) DEFAULT NULL,
	otp_hash VARCHAR(255) NOT NULL,
	channel ENUM('EMAIL','SMS','EMAIL_SMS','MANUAL') DEFAULT 'EMAIL',
	status ENUM('PENDING','VERIFIED','EXPIRED') DEFAULT 'PENDING',
	requested_ip VARCHAR(45) DEFAULT NULL,
	attempt_count INT DEFAULT 0,
	expires_at DATETIME NOT NULL,
	verified_at TIMESTAMP NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX idx_user_id (user_id),
	INDEX idx_email (email),
	INDEX idx_status (status),
	INDEX idx_expires_at (expires_at)
);

-- ============================================================
-- 3. PROVIDER PROFILES TABLE: Extended profile data for service providers
-- Links to users table with CASCADE delete
-- ============================================================
CREATE TABLE IF NOT EXISTS provider_profiles (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL UNIQUE,
	service_type VARCHAR(150) DEFAULT NULL,
	location VARCHAR(255) DEFAULT NULL,
	nid_number VARCHAR(20) DEFAULT NULL,
	is_verified BOOLEAN DEFAULT FALSE,
	verification_status ENUM('NOT_SUBMITTED','PENDING','UNDER_REVIEW','VERIFIED','REJECTED') DEFAULT 'NOT_SUBMITTED',
	verification_submitted_at TIMESTAMP NULL,
	verified_at TIMESTAMP NULL,
	verification_notes TEXT DEFAULT NULL,
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
	INDEX idx_is_available (is_available),
	INDEX idx_verification_status (verification_status)
);

-- ============================================================
-- 4. PROVIDER VERIFICATION DOCUMENTS TABLE: KYC evidence submitted by providers
-- ============================================================
CREATE TABLE IF NOT EXISTS provider_verification_documents (
	id INT AUTO_INCREMENT PRIMARY KEY,
	provider_profile_id INT NOT NULL,
	provider_user_id INT NOT NULL,
	document_type ENUM('NID','POLICE_CLEARANCE','SKILL_CERTIFICATE','LIVE_SELFIE','EXPERIENCE_PROOF','OTHER') NOT NULL,
	document_number VARCHAR(100) DEFAULT NULL,
	document_url VARCHAR(500) DEFAULT NULL,
	file_name VARCHAR(255) DEFAULT NULL,
	file_mime VARCHAR(100) DEFAULT NULL,
	status ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
	external_verification_status ENUM('NOT_CHECKED','PENDING','MATCHED','MISMATCHED','ERROR') DEFAULT 'NOT_CHECKED',
	external_verification_reference VARCHAR(255) DEFAULT NULL,
	external_verification_payload TEXT DEFAULT NULL,
	reviewer_id INT DEFAULT NULL,
	reviewer_notes TEXT DEFAULT NULL,
	reviewed_at TIMESTAMP NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (provider_profile_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
	FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
	INDEX idx_provider_profile_id (provider_profile_id),
	INDEX idx_provider_user_id (provider_user_id),
	INDEX idx_document_type (document_type),
	INDEX idx_status (status),
	INDEX idx_external_verification_status (external_verification_status)
);

-- ============================================================
-- 5. PROVIDER VERIFICATION AUDIT TABLE: State transitions and reviewer actions
-- ============================================================
CREATE TABLE IF NOT EXISTS provider_verification_audit_logs (
	id INT AUTO_INCREMENT PRIMARY KEY,
	provider_profile_id INT NOT NULL,
	provider_user_id INT NOT NULL,
	action ENUM('DOCUMENT_SUBMITTED','SUBMITTED_FOR_REVIEW','DOCUMENT_APPROVED','DOCUMENT_REJECTED','PROVIDER_APPROVED','PROVIDER_REJECTED','NOTE_ADDED') NOT NULL,
	old_status VARCHAR(50) DEFAULT NULL,
	new_status VARCHAR(50) DEFAULT NULL,
	actor_id INT DEFAULT NULL,
	notes TEXT DEFAULT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (provider_profile_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
	FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
	INDEX idx_provider_profile_id (provider_profile_id),
	INDEX idx_provider_user_id (provider_user_id),
	INDEX idx_action (action),
	INDEX idx_created_at (created_at)
);

-- ============================================================
-- 6. BOOKINGS TABLE: Core booking records with payment fields
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
	quoted_amount DECIMAL(10, 2) DEFAULT NULL,
	status ENUM('PENDING','ACCEPTED','ON_THE_WAY','ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'PENDING',
	handshake_code VARCHAR(10) DEFAULT NULL,
	is_emergency BOOLEAN DEFAULT FALSE,
	payment_status ENUM('UNPAID','PAID','FAILED','REFUNDED') DEFAULT 'UNPAID',
	payment_transaction_id VARCHAR(100) DEFAULT NULL,
	payment_amount DECIMAL(10, 2) DEFAULT NULL,
	payment_date TIMESTAMP NULL,
	accepted_at TIMESTAMP NULL,
	on_the_way_at TIMESTAMP NULL,
	arrived_at TIMESTAMP NULL,
	started_at TIMESTAMP NULL,
	completed_at TIMESTAMP NULL,
	cancelled_at TIMESTAMP NULL,
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
-- 7. PAYMENT TRANSACTIONS TABLE: Audit trail for all payments
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
-- 8. WALLETS TABLE: Available and pending balances for users/providers
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL UNIQUE,
	currency CHAR(3) DEFAULT 'BDT',
	balance DECIMAL(10, 2) DEFAULT 0.00,
	pending_balance DECIMAL(10, 2) DEFAULT 0.00,
	payout_reserved_balance DECIMAL(10, 2) DEFAULT 0.00,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX idx_user_id (user_id)
);

-- ============================================================
-- 9. WALLET TRANSACTIONS TABLE: Ledger entries for wallet movement
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
	id INT AUTO_INCREMENT PRIMARY KEY,
	wallet_id INT NOT NULL,
	user_id INT NOT NULL,
	booking_id INT DEFAULT NULL,
	type ENUM('CREDIT','DEBIT','ESCROW_HOLD','ESCROW_RELEASE','REFUND','PAYOUT','PAYOUT_REQUEST','PAYOUT_REJECTED','PAYOUT_PAID') NOT NULL,
	amount DECIMAL(10, 2) NOT NULL,
	balance_after DECIMAL(10, 2) DEFAULT NULL,
	reference_id VARCHAR(100) DEFAULT NULL,
	description TEXT DEFAULT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
	INDEX idx_wallet_id (wallet_id),
	INDEX idx_user_id (user_id),
	INDEX idx_booking_id (booking_id),
	INDEX idx_type (type)
);

-- ============================================================
-- 10. ESCROW PAYMENTS TABLE: Holds customer payment before provider release
-- ============================================================
CREATE TABLE IF NOT EXISTS escrow_payments (
	id INT AUTO_INCREMENT PRIMARY KEY,
	booking_id INT NOT NULL UNIQUE,
	customer_id INT NOT NULL,
	provider_id INT NOT NULL,
	payment_transaction_id VARCHAR(100) NOT NULL,
	amount DECIMAL(10, 2) NOT NULL,
	platform_fee DECIMAL(10, 2) DEFAULT 0.00,
	provider_amount DECIMAL(10, 2) NOT NULL,
	status ENUM('HELD','RELEASED','REFUNDED','DISPUTED') DEFAULT 'HELD',
	release_available_at TIMESTAMP NULL,
	released_at TIMESTAMP NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
	FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX idx_customer_id (customer_id),
	INDEX idx_provider_id (provider_id),
	INDEX idx_status (status),
	INDEX idx_release_available_at (release_available_at)
);

-- ============================================================
-- 10B. PAYOUT REQUESTS TABLE: Provider withdrawal workflow
-- ============================================================
CREATE TABLE IF NOT EXISTS payout_requests (
	id INT AUTO_INCREMENT PRIMARY KEY,
	provider_id INT NOT NULL,
	wallet_id INT NOT NULL,
	amount DECIMAL(10, 2) NOT NULL,
	currency CHAR(3) DEFAULT 'BDT',
	payout_method ENUM('BKASH','NAGAD','BANK') NOT NULL,
	account_ref VARCHAR(255) NOT NULL,
	status ENUM('REQUESTED','APPROVED','REJECTED','PAID','CANCELLED') DEFAULT 'REQUESTED',
	provider_notes TEXT DEFAULT NULL,
	reviewer_id INT DEFAULT NULL,
	reviewer_notes TEXT DEFAULT NULL,
	external_reference VARCHAR(255) DEFAULT NULL,
	requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	reviewed_at TIMESTAMP NULL,
	paid_at TIMESTAMP NULL,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
	FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
	INDEX idx_provider_id (provider_id),
	INDEX idx_status (status),
	INDEX idx_requested_at (requested_at),
	INDEX idx_reviewer_id (reviewer_id)
);

-- ============================================================
-- 11. SUPPORT TICKETS TABLE: Complaints, refund requests, and disputes
-- ============================================================
CREATE TABLE IF NOT EXISTS support_tickets (
	id INT AUTO_INCREMENT PRIMARY KEY,
	ticket_number VARCHAR(30) NOT NULL UNIQUE,
	booking_id INT DEFAULT NULL,
	created_by INT NOT NULL,
	assigned_to INT DEFAULT NULL,
	category ENUM('GENERAL','REFUND','DISPUTE','SAFETY','TECHNICAL') DEFAULT 'GENERAL',
	subject VARCHAR(255) NOT NULL,
	description TEXT NOT NULL,
	status ENUM('OPEN','IN_REVIEW','RESOLVED','CLOSED') DEFAULT 'OPEN',
	priority ENUM('LOW','NORMAL','HIGH','URGENT') DEFAULT 'NORMAL',
	resolution TEXT DEFAULT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
	FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
	INDEX idx_created_by (created_by),
	INDEX idx_status (status),
	INDEX idx_priority (priority),
	INDEX idx_booking_id (booking_id)
);

-- ============================================================
-- 12. SUPPORT TICKET MESSAGES TABLE: Conversation trail for tickets
-- ============================================================
CREATE TABLE IF NOT EXISTS support_ticket_messages (
	id INT AUTO_INCREMENT PRIMARY KEY,
	ticket_id INT NOT NULL,
	sender_id INT NOT NULL,
	message TEXT NOT NULL,
	is_internal BOOLEAN DEFAULT FALSE,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
	FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX idx_ticket_id (ticket_id),
	INDEX idx_sender_id (sender_id)
);

-- ============================================================
-- 13. PROVIDER BOOKMARKS TABLE: Customer saved providers for rebooking
-- ============================================================
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

-- ============================================================
-- 14. REVIEWS TABLE: Provider ratings and feedback from customers
-- Rating constraint: 1-5 scale
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
	id INT AUTO_INCREMENT PRIMARY KEY,
	booking_id INT DEFAULT NULL,
	provider_id INT NOT NULL,
	customer_id INT DEFAULT NULL,
	rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
	title VARCHAR(255) DEFAULT NULL,
	comment TEXT DEFAULT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
	FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
	UNIQUE KEY uniq_booking_review (booking_id),
	INDEX idx_provider_id (provider_id),
	INDEX idx_customer_id (customer_id),
	INDEX idx_rating (rating),
	INDEX idx_created_at (created_at)
);

-- ============================================================
-- 15. EMERGENCY LOGS TABLE: SOS/emergency event tracking
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
-- 16. NOTIFICATIONS TABLE: Audit trail for all notifications
-- For email, SMS, and in-app notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	booking_id INT DEFAULT NULL,
	notification_type VARCHAR(100) NOT NULL,
	channel ENUM('IN_APP','EMAIL','SMS','WHATSAPP','PUSH') DEFAULT 'IN_APP',
	title VARCHAR(255) DEFAULT NULL,
	message TEXT DEFAULT NULL,
	entity_type VARCHAR(100) DEFAULT NULL,
	entity_id INT DEFAULT NULL,
	delivery_status ENUM('QUEUED','SENT','FAILED','READ') DEFAULT 'QUEUED',
	is_read BOOLEAN DEFAULT FALSE,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	read_at TIMESTAMP NULL,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
	INDEX idx_user_id (user_id),
	INDEX idx_is_read (is_read),
	INDEX idx_delivery_status (delivery_status),
	INDEX idx_entity (entity_type, entity_id),
	INDEX idx_created_at (created_at)
);

-- ============================================================
-- 15B. PROVIDER LOCATIONS TABLE: Last known provider location for tracking
-- ============================================================
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

-- ============================================================
-- 17. BOOKING MESSAGES TABLE: Customer/provider booking chat
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_messages (
	id INT AUTO_INCREMENT PRIMARY KEY,
	booking_id INT NOT NULL,
	sender_id INT NOT NULL,
	message TEXT NOT NULL,
	is_read BOOLEAN DEFAULT FALSE,
	read_at TIMESTAMP NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
	FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX idx_booking_id (booking_id),
	INDEX idx_sender_id (sender_id),
	INDEX idx_is_read (is_read),
	INDEX idx_created_at (created_at)
);

-- ============================================================
-- 18. BOOKING CALL REQUESTS TABLE: Consent-based voice/video coordination
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_call_requests (
	id INT AUTO_INCREMENT PRIMARY KEY,
	booking_id INT NOT NULL,
	requester_id INT NOT NULL,
	recipient_id INT NOT NULL,
	call_type ENUM('VOICE','VIDEO') DEFAULT 'VOICE',
	status ENUM('REQUESTED','ACCEPTED','DECLINED','COMPLETED','MISSED','CANCELLED') DEFAULT 'REQUESTED',
	reason VARCHAR(500) DEFAULT NULL,
	accepted_at TIMESTAMP NULL,
	completed_at TIMESTAMP NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
	FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX idx_booking_id (booking_id),
	INDEX idx_requester_id (requester_id),
	INDEX idx_recipient_id (recipient_id),
	INDEX idx_status (status),
	INDEX idx_created_at (created_at)
);

-- ============================================================
-- 19. AUDIT LOG TABLE: Track all critical system actions
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
-- 4. Added provider verification workflow fields and tables:
--    - provider_profiles.verification_status / submitted / verified timestamps
--    - provider_verification_documents for NID, police clearance, selfie, skill docs
--    - provider_verification_audit_logs for reviewer decisions and traceability
--
-- 5. Added comprehensive indexes across all tables
--    - Optimizes: customer/provider lookups, status filtering, date ranges
--
-- 6. Added wallet, wallet_transactions, and escrow_payments tables:
--    - Holds provider funds in pending balance until escrow release
--    - Keeps immutable wallet movement ledger entries
--    - Supports provider payout reservation and operations review
--
-- 7. Added support_tickets and support_ticket_messages tables:
--    - Tracks complaints, refund requests, disputes, and support replies
--
-- 8. Added emergency_logs enhancements:
--    - Added latitude/longitude fields (DECIMAL precision for GPS)
--    - Added emergency_type and status tracking
--
-- 9. Enhanced notifications table:
--    - Supports IN_APP, EMAIL, SMS, WHATSAPP, and PUSH channel queue records
--    - Tracks delivery_status, read_at, and generic entity references
--
-- 10. Added audit_logs table for compliance and debugging
--
-- 11. Enforced one review per completed booking:
--    - reviews.uniq_booking_review prevents duplicate booking feedback
--    - reviews.idx_created_at speeds recent review feeds
--
-- 12. Added provider_bookmarks table:
--    - Persists customer saved providers
--    - Supports direct rebooking through saved provider records
--
-- 13. Added password_reset_requests table:
--    - Stores hashed reset tokens and OTPs
--    - Enforces expiry, attempt tracking, and one-time use
--
-- 14. Added registration_verification_requests and user account verification:
--    - Blocks production login until registration OTP is verified
--    - Supports email/SMS/manual delivery tracking and attempt limits
--
-- 15. Expanded user roles for tiered operations:
--    - admin, super_admin, support_agent, verification_officer
--    - Enables least-privilege support, KYC, SOS, and refund workflows
--
-- 16. All tables use utf8mb4 for proper emoji/unicode support
--
-- 17. Added booking_messages and booking_call_requests:
--    - Enables booking-scoped chat and consent-based voice/video requests
--    - Uses participant-only access through API and booking socket rooms
-- ============================================================
