-- Expand booking lifecycle to match real service execution flow.
-- Apply after database/serviio_schema.sql on existing installations.

USE serviio_db;

ALTER TABLE bookings
	MODIFY COLUMN status ENUM(
		'PENDING',
		'ACCEPTED',
		'ON_THE_WAY',
		'ARRIVED',
		'IN_PROGRESS',
		'COMPLETED',
		'CANCELLED'
	) DEFAULT 'PENDING';

ALTER TABLE bookings
	ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP NULL AFTER payment_date,
	ADD COLUMN IF NOT EXISTS on_the_way_at TIMESTAMP NULL AFTER accepted_at,
	ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP NULL AFTER on_the_way_at,
	ADD COLUMN IF NOT EXISTS started_at TIMESTAMP NULL AFTER arrived_at,
	ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP NULL AFTER started_at,
	ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL AFTER completed_at;

UPDATE bookings SET
	started_at = COALESCE(started_at, updated_at)
WHERE status = 'IN_PROGRESS';

UPDATE bookings SET
	completed_at = COALESCE(completed_at, updated_at)
WHERE status = 'COMPLETED';

UPDATE bookings SET
	cancelled_at = COALESCE(cancelled_at, updated_at)
WHERE status = 'CANCELLED';
