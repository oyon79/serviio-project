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
