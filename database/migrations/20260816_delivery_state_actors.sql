BEGIN;

-- Keep the most recent executor of each durable delivery transition after the
-- lease owner is cleared. This is operational metadata only: it never stores
-- message content, contact data, or provider response bodies.
ALTER TABLE inbound_receipts
  ADD COLUMN IF NOT EXISTS last_actor VARCHAR(128);

ALTER TABLE response_outbox
  ADD COLUMN IF NOT EXISTS last_actor VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_inbound_receipts_actor
  ON inbound_receipts (tenant_id, last_actor, updated_at)
  WHERE last_actor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_response_outbox_actor
  ON response_outbox (tenant_id, last_actor, updated_at)
  WHERE last_actor IS NOT NULL;

COMMIT;
