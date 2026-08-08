BEGIN;

-- A failed/uncertain mutating tool never retries automatically. An operator
-- can explicitly confirm the external effect or authorize a new claim.
ALTER TABLE tool_executions
  ADD COLUMN IF NOT EXISTS reconciled_by VARCHAR(128),
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP WITH TIME ZONE;

COMMIT;
