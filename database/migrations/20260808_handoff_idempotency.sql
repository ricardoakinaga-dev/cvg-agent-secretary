BEGIN;

ALTER TABLE handoffs
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200);

UPDATE handoffs
SET idempotency_key = 'legacy:' || id::TEXT
WHERE idempotency_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_handoffs_tenant_idempotency
  ON handoffs (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
