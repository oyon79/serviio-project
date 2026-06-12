ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_verified BOOLEAN DEFAULT TRUE AFTER is_active,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL AFTER account_verified,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP NULL AFTER email_verified_at;

CREATE INDEX IF NOT EXISTS idx_account_verified ON users (account_verified);

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
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_email (email),
  INDEX idx_status (status),
  INDEX idx_expires_at (expires_at)
);
