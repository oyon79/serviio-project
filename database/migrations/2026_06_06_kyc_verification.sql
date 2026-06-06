-- SERVIIO migration: KYC verification workflow
-- Apply after database/serviio_schema.sql has created the base schema.

USE serviio_db;

ALTER TABLE provider_profiles
	ADD COLUMN IF NOT EXISTS verification_status ENUM('NOT_SUBMITTED','PENDING','UNDER_REVIEW','VERIFIED','REJECTED') DEFAULT 'NOT_SUBMITTED' AFTER is_verified,
	ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMP NULL AFTER verification_status,
	ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP NULL AFTER verification_submitted_at,
	ADD COLUMN IF NOT EXISTS verification_notes TEXT DEFAULT NULL AFTER verified_at,
	ADD INDEX IF NOT EXISTS idx_verification_status (verification_status);

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
	INDEX idx_status (status)
);

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
