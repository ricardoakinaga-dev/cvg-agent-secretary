BEGIN;

-- Recoverable database-side ownership for an inbound turn. Redis leases the
-- queue job, while these fields prevent a recovered job from being executed
-- concurrently with the worker that still owns the receipt.
ALTER TABLE inbound_receipts
  ADD COLUMN IF NOT EXISTS processing_owner VARCHAR(128),
  ADD COLUMN IF NOT EXISTS processing_until TIMESTAMPTZ;

COMMIT;
