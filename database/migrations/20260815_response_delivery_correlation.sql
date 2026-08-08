BEGIN;

-- Keep the request/event correlation attached to the durable response intent.
-- Existing rows remain valid and are backfilled only when a later reconciliation
-- path can supply the value; correlation is intentionally nullable for them.
ALTER TABLE response_outbox
  ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_response_outbox_correlation
  ON response_outbox (tenant_id, correlation_id, created_at)
  WHERE correlation_id IS NOT NULL;

COMMIT;
