BEGIN;

-- Preserve the source event timestamp independently from the minimized payload
-- so workers can serialize turns from the same conversation after concurrent
-- webhook delivery without trusting Redis arrival order.
ALTER TABLE inbound_receipts
  ADD COLUMN IF NOT EXISTS source_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_inbound_receipts_conversation_order
  ON inbound_receipts (tenant_id, chatwoot_conversation_id, source_created_at, created_at)
  WHERE source_created_at IS NOT NULL;

COMMIT;
