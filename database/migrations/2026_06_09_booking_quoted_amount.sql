-- Store server-calculated payable booking amount.

USE serviio_db;

ALTER TABLE bookings
	ADD COLUMN IF NOT EXISTS quoted_amount DECIMAL(10, 2) DEFAULT NULL AFTER estimated_price_range;

UPDATE bookings
SET quoted_amount = COALESCE(payment_amount, quoted_amount)
WHERE quoted_amount IS NULL AND payment_amount IS NOT NULL;
