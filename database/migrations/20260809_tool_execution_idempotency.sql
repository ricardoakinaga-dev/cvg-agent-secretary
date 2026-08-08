-- AI-002: a mutating tool execution is claimed once per inbound turn.
-- A pending claim is fail-closed after a crash so a side effect is not
-- repeated without an explicit reconciliation decision.
ALTER TABLE tool_executions
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS uk_tool_executions_tenant_idempotency
  ON tool_executions (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tool_executions_reconciliation
  ON tool_executions (tenant_id, status, created_at)
  WHERE idempotency_key IS NOT NULL;
