BEGIN;

-- G1: durable inbound receipts. Redis is only the dispatch/lease layer; the
-- payload needed for recovery remains in PostgreSQL with a minimized shape.
CREATE TABLE IF NOT EXISTS inbound_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id BIGINT NOT NULL,
  delivery_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  chatwoot_conversation_id BIGINT,
  chatwoot_message_id BIGINT,
  source_created_at TIMESTAMPTZ,
  correlation_id VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'accepted',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_owner VARCHAR(128),
  processing_until TIMESTAMPTZ,
  last_actor VARCHAR(128),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT ck_inbound_receipts_status
    CHECK (status IN ('accepted', 'queued', 'processing', 'retry', 'processed', 'dead_letter')),
  CONSTRAINT ck_inbound_receipts_attempts CHECK (attempts >= 0),
  CONSTRAINT uk_inbound_receipts_tenant_delivery UNIQUE (tenant_id, delivery_id),
  CONSTRAINT uk_inbound_receipts_tenant_id UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_inbound_receipts_tenant_message
  ON inbound_receipts (tenant_id, chatwoot_message_id)
  WHERE chatwoot_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbound_receipts_recovery
  ON inbound_receipts (tenant_id, status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_inbound_receipts_conversation_order
  ON inbound_receipts (tenant_id, chatwoot_conversation_id, source_created_at, created_at)
  WHERE source_created_at IS NOT NULL;

CREATE OR REPLACE FUNCTION update_inbound_receipt_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inbound_receipts_updated_at ON inbound_receipts;
CREATE TRIGGER inbound_receipts_updated_at
  BEFORE UPDATE ON inbound_receipts
  FOR EACH ROW EXECUTE FUNCTION update_inbound_receipt_updated_at();

ALTER TABLE inbound_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inbound_receipts;
CREATE POLICY tenant_isolation ON inbound_receipts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);

-- G1: durable response intent/outbox. No external POST is allowed before a
-- row exists here. 'unknown' is deliberately terminal for automatic retries;
-- reconciliation must decide whether an external message already exists.
CREATE TABLE IF NOT EXISTS response_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id BIGINT NOT NULL,
  conversation_id UUID NOT NULL,
  chatwoot_conversation_id BIGINT NOT NULL,
  inbound_chatwoot_message_id BIGINT NOT NULL,
  correlation_id VARCHAR(128),
  idempotency_key VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  lock_owner VARCHAR(128),
  lock_until TIMESTAMPTZ,
  last_actor VARCHAR(128),
  attempts INTEGER NOT NULL DEFAULT 0,
  chatwoot_message_id BIGINT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT ck_response_outbox_status
    CHECK (status IN ('pending', 'sending', 'sent', 'unknown', 'failed', 'reconciled')),
  CONSTRAINT ck_response_outbox_attempts CHECK (attempts >= 0),
  CONSTRAINT uk_response_outbox_tenant_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT uk_response_outbox_tenant_inbound
    UNIQUE (tenant_id, conversation_id, inbound_chatwoot_message_id),
  CONSTRAINT fk_response_outbox_conversation
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_response_outbox_recovery
  ON response_outbox (tenant_id, status, lock_until, updated_at);

CREATE OR REPLACE FUNCTION update_response_outbox_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS response_outbox_updated_at ON response_outbox;
CREATE TRIGGER response_outbox_updated_at
  BEFORE UPDATE ON response_outbox
  FOR EACH ROW EXECUTE FUNCTION update_response_outbox_updated_at();

ALTER TABLE response_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON response_outbox;
CREATE POLICY tenant_isolation ON response_outbox
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);

-- G2: PostgreSQL source of truth for automation and human handoff state.
CREATE TABLE IF NOT EXISTS conversation_control_state (
  tenant_id BIGINT NOT NULL,
  conversation_id UUID NOT NULL,
  state VARCHAR(24) NOT NULL DEFAULT 'automated',
  handoff_until TIMESTAMPTZ,
  handoff_expired_at TIMESTAMPTZ,
  handoff_reason VARCHAR(500),
  handoff_owner VARCHAR(128),
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, conversation_id),
  CONSTRAINT ck_conversation_control_state
    CHECK (state IN ('automated', 'handoff_pending', 'handoff_active', 'completed')),
  CONSTRAINT fk_conversation_control_conversation
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_control_handoff
  ON conversation_control_state (tenant_id, state, handoff_until);

CREATE OR REPLACE FUNCTION update_conversation_control_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_control_updated_at ON conversation_control_state;
CREATE TRIGGER conversation_control_updated_at
  BEFORE UPDATE ON conversation_control_state
  FOR EACH ROW EXECUTE FUNCTION update_conversation_control_updated_at();

ALTER TABLE conversation_control_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON conversation_control_state;
CREATE POLICY tenant_isolation ON conversation_control_state
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);

COMMIT;
