-- OBS-004: durable, idempotent, append-only critical audit trail.

CREATE TABLE IF NOT EXISTS audit_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  actor VARCHAR(128) NOT NULL,
  actor_role VARCHAR(20),
  actor_source VARCHAR(32) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  correlation_id VARCHAR(128),
  integrity_hash CHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_audit_outbox_actor_source
    CHECK (actor_source IN ('signed_identity', 'trusted_service', 'legacy')),
  CONSTRAINT ck_audit_outbox_integrity_hash
    CHECK (integrity_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uk_audit_outbox_tenant_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT uk_audit_outbox_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_audit_outbox_pending
  ON audit_outbox (tenant_id, occurred_at, id);

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(20),
  ADD COLUMN IF NOT EXISTS actor_source VARCHAR(32) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS integrity_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS outbox_event_id UUID;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS ck_audit_events_actor_source,
  ADD CONSTRAINT ck_audit_events_actor_source
    CHECK (actor_source IN ('signed_identity', 'trusted_service', 'legacy')),
  DROP CONSTRAINT IF EXISTS ck_audit_events_integrity_hash,
  ADD CONSTRAINT ck_audit_events_integrity_hash
    CHECK (integrity_hash IS NULL OR integrity_hash ~ '^[0-9a-f]{64}$'),
  DROP CONSTRAINT IF EXISTS ck_audit_events_signed_outbox,
  ADD CONSTRAINT ck_audit_events_signed_outbox
    CHECK (actor_source <> 'signed_identity' OR outbox_event_id IS NOT NULL),
  DROP CONSTRAINT IF EXISTS fk_audit_events_outbox,
  ADD CONSTRAINT fk_audit_events_outbox
    FOREIGN KEY (tenant_id, outbox_event_id)
    REFERENCES audit_outbox (tenant_id, id),
  DROP CONSTRAINT IF EXISTS uk_audit_events_tenant_outbox,
  ADD CONSTRAINT uk_audit_events_tenant_outbox
    UNIQUE (tenant_id, outbox_event_id);

ALTER TABLE audit_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_outbox;
CREATE POLICY tenant_isolation ON audit_outbox
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);

CREATE OR REPLACE FUNCTION reject_audit_record_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_outbox_append_only ON audit_outbox;
CREATE TRIGGER audit_outbox_append_only
  BEFORE UPDATE OR DELETE ON audit_outbox
  FOR EACH ROW EXECUTE FUNCTION reject_audit_record_mutation();

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_audit_record_mutation();
