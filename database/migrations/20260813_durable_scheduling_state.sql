BEGIN;

-- PostgreSQL becomes the source of truth for appointment-flow state. Redis
-- remains a cache and may be repopulated after a restart without data loss.
CREATE TABLE IF NOT EXISTS conversation_scheduling_state (
    tenant_id BIGINT NOT NULL,
    conversation_id UUID NOT NULL,
    state JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, conversation_id),
    CONSTRAINT conversation_scheduling_state_object
        CHECK (jsonb_typeof(state) = 'object'),
    FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_scheduling_state_updated
    ON conversation_scheduling_state(tenant_id, updated_at);

ALTER TABLE conversation_scheduling_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'conversation_scheduling_state'
          AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON conversation_scheduling_state
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
            WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
    END IF;
END
$$;

DROP TRIGGER IF EXISTS update_conversation_scheduling_state_updated_at
    ON conversation_scheduling_state;
CREATE TRIGGER update_conversation_scheduling_state_updated_at
    BEFORE UPDATE ON conversation_scheduling_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
