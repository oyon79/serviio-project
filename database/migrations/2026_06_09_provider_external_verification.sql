-- SERVIIO migration: provider external KYC verification metadata.

USE serviio_db;

ALTER TABLE provider_verification_documents
	ADD COLUMN IF NOT EXISTS external_verification_status ENUM('NOT_CHECKED','PENDING','MATCHED','MISMATCHED','ERROR') DEFAULT 'NOT_CHECKED' AFTER status,
	ADD COLUMN IF NOT EXISTS external_verification_reference VARCHAR(255) DEFAULT NULL AFTER external_verification_status,
	ADD COLUMN IF NOT EXISTS external_verification_payload TEXT DEFAULT NULL AFTER external_verification_reference,
	ADD INDEX IF NOT EXISTS idx_external_verification_status (external_verification_status);
