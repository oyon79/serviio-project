ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS payout_reserved_balance DECIMAL(10, 2) DEFAULT 0.00 AFTER pending_balance;

ALTER TABLE wallet_transactions
  MODIFY COLUMN type ENUM(
    'CREDIT',
    'DEBIT',
    'ESCROW_HOLD',
    'ESCROW_RELEASE',
    'REFUND',
    'PAYOUT',
    'PAYOUT_REQUEST',
    'PAYOUT_REJECTED',
    'PAYOUT_PAID'
  ) NOT NULL;

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
