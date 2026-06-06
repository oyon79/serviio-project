-- SERVIIO demo data
-- Password for all demo accounts: Passw0rd!
-- Apply after database/serviio_schema.sql.

USE serviio_db;

SET @demo_password_hash = '$2b$12$3TacDNJmDc/tYLV9QNNJNejq04bAHxhjpO5LkxedC7QwsNCaL7wci';

INSERT INTO users (first_name, last_name, email, phone, password, role, is_active)
VALUES
  ('Admin', 'User', 'admin@serviio.test', '01700000001', @demo_password_hash, 'admin', TRUE),
  ('Customer', 'User', 'customer@serviio.test', '01700000002', @demo_password_hash, 'customer', TRUE),
  ('Rahim', 'Electrician', 'provider@serviio.test', '01700000003', @demo_password_hash, 'provider', TRUE),
  ('Karim', 'Plumber', 'plumber@serviio.test', '01700000004', @demo_password_hash, 'provider', TRUE)
ON DUPLICATE KEY UPDATE
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  phone = VALUES(phone),
  password = VALUES(password),
  role = VALUES(role),
  is_active = TRUE;

SET @customer_id = (SELECT id FROM users WHERE email = 'customer@serviio.test' LIMIT 1);
SET @provider_id = (SELECT id FROM users WHERE email = 'provider@serviio.test' LIMIT 1);
SET @plumber_id = (SELECT id FROM users WHERE email = 'plumber@serviio.test' LIMIT 1);

INSERT INTO provider_profiles
  (user_id, service_type, location, nid_number, is_verified, verification_status,
   verification_submitted_at, verified_at, experience_summary, is_available,
   hourly_rate, total_reviews, average_rating)
VALUES
  (@provider_id, 'Electrician', 'Uttara', '1234567890', TRUE, 'VERIFIED',
   NOW(), NOW(), 'Licensed home electrician for wiring, fan repair, breaker issues, and urgent safety checks.', TRUE,
   550.00, 1, 5.00),
  (@plumber_id, 'Plumber', 'Mirpur', '1234567890123', TRUE, 'VERIFIED',
   NOW(), NOW(), 'Experienced plumber for leaks, blocked drains, fittings, and bathroom maintenance.', TRUE,
   500.00, 0, 0.00)
ON DUPLICATE KEY UPDATE
  service_type = VALUES(service_type),
  location = VALUES(location),
  nid_number = VALUES(nid_number),
  is_verified = VALUES(is_verified),
  verification_status = VALUES(verification_status),
  verified_at = VALUES(verified_at),
  experience_summary = VALUES(experience_summary),
  is_available = VALUES(is_available),
  hourly_rate = VALUES(hourly_rate);

INSERT IGNORE INTO wallets (user_id, balance, pending_balance)
VALUES
  (@customer_id, 0.00, 0.00),
  (@provider_id, 0.00, 0.00),
  (@plumber_id, 0.00, 0.00);

INSERT INTO bookings
  (customer_id, provider_id, service_type, job_location, booking_date,
   estimated_price_range, status, handshake_code, is_emergency,
   payment_status, payment_transaction_id, payment_amount, payment_date)
SELECT
  @customer_id, @provider_id, 'Electrician', 'House 12, Road 4, Uttara',
  DATE_SUB(NOW(), INTERVAL 2 DAY), 'BDT 500 - BDT 800', 'COMPLETED',
  '1234', FALSE, 'PAID', 'DEMO-TXN-001', 550.00, DATE_SUB(NOW(), INTERVAL 2 DAY)
WHERE NOT EXISTS (
  SELECT 1 FROM bookings WHERE payment_transaction_id = 'DEMO-TXN-001'
);

SET @completed_booking_id = (
  SELECT id
  FROM bookings
  WHERE customer_id = @customer_id
    AND provider_id = @provider_id
    AND payment_transaction_id = 'DEMO-TXN-001'
  LIMIT 1
);

INSERT INTO reviews (booking_id, provider_id, customer_id, rating, title, comment)
VALUES
  (@completed_booking_id, @provider_id, @customer_id, 5, 'Fast and professional', 'Arrived on time and fixed the wiring issue cleanly.')
ON DUPLICATE KEY UPDATE
  rating = VALUES(rating),
  title = VALUES(title),
  comment = VALUES(comment);

UPDATE provider_profiles
SET
  total_reviews = (SELECT COUNT(*) FROM reviews WHERE provider_id = @provider_id),
  average_rating = (
    SELECT ROUND(COALESCE(AVG(rating), 0), 2)
    FROM reviews
    WHERE provider_id = @provider_id
  )
WHERE user_id = @provider_id;
