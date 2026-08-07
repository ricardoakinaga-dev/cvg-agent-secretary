-- Required invocation (replace 123 with CHATWOOT_ACCOUNT_ID):
-- PGOPTIONS='-c app.migration_tenant_id=123' psql "$DATABASE_URL" --single-transaction --file=database/migrations/20260802_add_tenant_isolation.sql
--
-- This migration intentionally has no implicit tenant default. Existing rows must
-- be assigned explicitly so a deployment cannot silently claim another account's data.
DO $$
DECLARE
    migration_tenant_id TEXT := current_setting('app.migration_tenant_id', true);
BEGIN
    IF migration_tenant_id IS NULL
       OR migration_tenant_id !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION
            'app.migration_tenant_id must be set to a positive bigint before running this migration';
    END IF;
END
$$;

-- Some legacy installations predate the optional sector notification schema.
-- Create the table in expand form before the tenant backfill below so the
-- cumulative migration can upgrade those databases safely.
CREATE TABLE IF NOT EXISTS sector_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT,
    sector VARCHAR(50) NOT NULL,
    conversation_id UUID,
    contact_id UUID,
    message TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- response_feedback was used by the learning service without a versioned table.
CREATE TABLE IF NOT EXISTS response_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id VARCHAR(255) NOT NULL,
    message_id VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    quality VARCHAR(20) NOT NULL,
    failure_type VARCHAR(50),
    feedback TEXT,
    useful_chunks JSONB DEFAULT '[]',
    provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Expand: nullable columns allow the application and migration to be deployed separately.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE customer_memories ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE conversation_summaries ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE tool_executions ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE sector_notifications ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE appointment_services ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE appointment_providers ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE appointment_slots ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE followup_tasks ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE telegram_ingestions ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE operational_rules ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
ALTER TABLE response_feedback ADD COLUMN IF NOT EXISTS tenant_id BIGINT;

-- Backfill: this first slice maps all existing single-account data to one explicit account.
UPDATE conversations
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE messages
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE contacts
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE pets
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE customer_memories
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE audit_logs
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE conversation_summaries
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE tool_executions
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE handoffs
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE sector_notifications
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE appointment_services
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE appointment_providers
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE appointment_slots
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE appointments
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE followup_tasks
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE knowledge_documents
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE knowledge_chunks
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE telegram_ingestions
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE operational_rules
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE analytics_events
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE audit_events
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;
UPDATE response_feedback
SET tenant_id = current_setting('app.migration_tenant_id', true)::BIGINT
WHERE tenant_id IS NULL;

-- Contract: future writes must always identify their tenant.
ALTER TABLE conversations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pets ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE customer_memories ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE conversation_summaries ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tool_executions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE handoffs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE sector_notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE appointment_services ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE appointment_providers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE appointment_slots ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE appointments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE followup_tasks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE knowledge_documents ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE knowledge_chunks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE telegram_ingestions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE operational_rules ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE analytics_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE audit_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE response_feedback ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS conversations_chatwoot_conversation_id_key;
DROP INDEX IF EXISTS uk_conversations_tenant_chatwoot_id;
ALTER TABLE conversations
    ADD CONSTRAINT uk_conversations_tenant_chatwoot_id
    UNIQUE (tenant_id, chatwoot_conversation_id);

DROP INDEX IF EXISTS uk_messages_conversation_chatwoot_message;
CREATE UNIQUE INDEX uk_messages_tenant_conversation_chatwoot_message
    ON messages(tenant_id, conversation_id, chatwoot_message_id);

DROP INDEX IF EXISTS uk_contacts_chatwoot_id;
DROP INDEX IF EXISTS uk_contacts_phone;
DROP INDEX IF EXISTS uk_contacts_email;
CREATE UNIQUE INDEX uk_contacts_tenant_chatwoot_id
    ON contacts(tenant_id, chatwoot_id) WHERE chatwoot_id IS NOT NULL;
CREATE UNIQUE INDEX uk_contacts_tenant_phone
    ON contacts(tenant_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX uk_contacts_tenant_email
    ON contacts(tenant_id, email) WHERE email IS NOT NULL;

-- Tenant/id keys support composite foreign keys that reject cross-tenant references.
CREATE UNIQUE INDEX uk_conversations_tenant_id ON conversations(tenant_id, id);
CREATE UNIQUE INDEX uk_contacts_tenant_id ON contacts(tenant_id, id);
CREATE UNIQUE INDEX uk_pets_tenant_id ON pets(tenant_id, id);

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
ALTER TABLE messages
    ADD CONSTRAINT messages_tenant_conversation_fkey
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE pets DROP CONSTRAINT IF EXISTS pets_contact_id_fkey;
ALTER TABLE pets
    ADD CONSTRAINT pets_tenant_contact_fkey
    FOREIGN KEY (tenant_id, contact_id)
    REFERENCES contacts(tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE customer_memories DROP CONSTRAINT IF EXISTS customer_memories_contact_id_fkey;
ALTER TABLE customer_memories DROP CONSTRAINT IF EXISTS customer_memories_pet_id_fkey;
ALTER TABLE customer_memories DROP CONSTRAINT IF EXISTS customer_memories_conversation_id_fkey;
ALTER TABLE customer_memories
    ADD CONSTRAINT memories_tenant_contact_fkey
    FOREIGN KEY (tenant_id, contact_id)
    REFERENCES contacts(tenant_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE customer_memories
    ADD CONSTRAINT memories_tenant_pet_fkey
    FOREIGN KEY (tenant_id, pet_id)
    REFERENCES pets(tenant_id, id) ON DELETE SET NULL (pet_id) NOT VALID;
ALTER TABLE customer_memories
    ADD CONSTRAINT memories_tenant_conversation_fkey
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE SET NULL (conversation_id) NOT VALID;

ALTER TABLE messages VALIDATE CONSTRAINT messages_tenant_conversation_fkey;
ALTER TABLE pets VALIDATE CONSTRAINT pets_tenant_contact_fkey;
ALTER TABLE customer_memories VALIDATE CONSTRAINT memories_tenant_contact_fkey;
ALTER TABLE customer_memories VALIDATE CONSTRAINT memories_tenant_pet_fkey;
ALTER TABLE customer_memories VALIDATE CONSTRAINT memories_tenant_conversation_fkey;

-- Composite parent keys allow foreign keys to carry the tenant boundary.
CREATE UNIQUE INDEX uk_appointment_services_tenant_id ON appointment_services(tenant_id, id);
CREATE UNIQUE INDEX uk_appointment_providers_tenant_id ON appointment_providers(tenant_id, id);
CREATE UNIQUE INDEX uk_appointment_slots_tenant_id ON appointment_slots(tenant_id, id);
CREATE UNIQUE INDEX uk_knowledge_documents_tenant_id ON knowledge_documents(tenant_id, id);
CREATE UNIQUE INDEX uk_telegram_ingestions_tenant_id ON telegram_ingestions(tenant_id, id);

ALTER TABLE conversation_summaries
    DROP CONSTRAINT IF EXISTS conversation_summaries_conversation_id_fkey;
ALTER TABLE conversation_summaries
    ADD CONSTRAINT summaries_tenant_conversation_fkey
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE tool_executions DROP CONSTRAINT IF EXISTS tool_executions_conversation_id_fkey;
ALTER TABLE tool_executions DROP CONSTRAINT IF EXISTS tool_executions_contact_id_fkey;
ALTER TABLE tool_executions
    ADD CONSTRAINT tools_tenant_conversation_fkey
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE SET NULL (conversation_id) NOT VALID;
ALTER TABLE tool_executions
    ADD CONSTRAINT tools_tenant_contact_fkey
    FOREIGN KEY (tenant_id, contact_id)
    REFERENCES contacts(tenant_id, id) ON DELETE SET NULL (contact_id) NOT VALID;

ALTER TABLE appointment_slots DROP CONSTRAINT IF EXISTS appointment_slots_service_id_fkey;
ALTER TABLE appointment_slots DROP CONSTRAINT IF EXISTS appointment_slots_provider_id_fkey;
ALTER TABLE appointment_slots
    ADD CONSTRAINT slots_tenant_service_fkey
    FOREIGN KEY (tenant_id, service_id)
    REFERENCES appointment_services(tenant_id, id) ON DELETE SET NULL (service_id) NOT VALID;
ALTER TABLE appointment_slots
    ADD CONSTRAINT slots_tenant_provider_fkey
    FOREIGN KEY (tenant_id, provider_id)
    REFERENCES appointment_providers(tenant_id, id) ON DELETE SET NULL (provider_id) NOT VALID;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_slot_id_fkey;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_service_id_fkey;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_provider_id_fkey;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_tenant_slot_fkey
    FOREIGN KEY (tenant_id, slot_id)
    REFERENCES appointment_slots(tenant_id, id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_tenant_service_fkey
    FOREIGN KEY (tenant_id, service_id)
    REFERENCES appointment_services(tenant_id, id) ON DELETE SET NULL (service_id) NOT VALID;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_tenant_provider_fkey
    FOREIGN KEY (tenant_id, provider_id)
    REFERENCES appointment_providers(tenant_id, id) ON DELETE SET NULL (provider_id) NOT VALID;

ALTER TABLE followup_tasks DROP CONSTRAINT IF EXISTS followup_tasks_conversation_id_fkey;
ALTER TABLE followup_tasks DROP CONSTRAINT IF EXISTS followup_tasks_contact_id_fkey;
ALTER TABLE followup_tasks
    ADD CONSTRAINT followups_tenant_conversation_fkey
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE SET NULL (conversation_id) NOT VALID;
ALTER TABLE followup_tasks
    ADD CONSTRAINT followups_tenant_contact_fkey
    FOREIGN KEY (tenant_id, contact_id)
    REFERENCES contacts(tenant_id, id) ON DELETE SET NULL (contact_id) NOT VALID;

ALTER TABLE knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_document_id_fkey;
ALTER TABLE knowledge_chunks
    ADD CONSTRAINT chunks_tenant_document_fkey
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES knowledge_documents(tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE telegram_ingestions DROP CONSTRAINT IF EXISTS telegram_ingestions_knowledge_document_id_fkey;
ALTER TABLE telegram_ingestions
    ADD CONSTRAINT ingestions_tenant_document_fkey
    FOREIGN KEY (tenant_id, knowledge_document_id)
    REFERENCES knowledge_documents(tenant_id, id) ON DELETE SET NULL (knowledge_document_id) NOT VALID;

ALTER TABLE operational_rules DROP CONSTRAINT IF EXISTS operational_rules_source_id_fkey;
ALTER TABLE operational_rules
    ADD CONSTRAINT rules_tenant_source_fkey
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES telegram_ingestions(tenant_id, id) ON DELETE SET NULL (source_id) NOT VALID;

ALTER TABLE conversation_summaries VALIDATE CONSTRAINT summaries_tenant_conversation_fkey;
ALTER TABLE tool_executions VALIDATE CONSTRAINT tools_tenant_conversation_fkey;
ALTER TABLE tool_executions VALIDATE CONSTRAINT tools_tenant_contact_fkey;
ALTER TABLE appointment_slots VALIDATE CONSTRAINT slots_tenant_service_fkey;
ALTER TABLE appointment_slots VALIDATE CONSTRAINT slots_tenant_provider_fkey;
ALTER TABLE appointments VALIDATE CONSTRAINT appointments_tenant_slot_fkey;
ALTER TABLE appointments VALIDATE CONSTRAINT appointments_tenant_service_fkey;
ALTER TABLE appointments VALIDATE CONSTRAINT appointments_tenant_provider_fkey;
ALTER TABLE followup_tasks VALIDATE CONSTRAINT followups_tenant_conversation_fkey;
ALTER TABLE followup_tasks VALIDATE CONSTRAINT followups_tenant_contact_fkey;
ALTER TABLE knowledge_chunks VALIDATE CONSTRAINT chunks_tenant_document_fkey;
ALTER TABLE telegram_ingestions VALIDATE CONSTRAINT ingestions_tenant_document_fkey;
ALTER TABLE operational_rules VALIDATE CONSTRAINT rules_tenant_source_fkey;

DROP INDEX IF EXISTS idx_appointments_active_slot;
CREATE UNIQUE INDEX idx_appointments_active_slot
    ON appointments(tenant_id, slot_id)
    WHERE status IN ('reserved', 'confirmed');

CREATE INDEX idx_conversations_tenant_contact ON conversations(tenant_id, chatwoot_contact_id);
CREATE INDEX idx_conversations_tenant_status ON conversations(tenant_id, status);
CREATE INDEX idx_messages_tenant_created ON messages(tenant_id, created_at);
CREATE INDEX idx_contacts_tenant_name ON contacts(tenant_id, name);
CREATE INDEX idx_pets_tenant_contact ON pets(tenant_id, contact_id);
CREATE INDEX idx_memories_tenant_contact_active
    ON customer_memories(tenant_id, contact_id, is_active) WHERE is_active = true;
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at);
CREATE INDEX idx_summaries_tenant_conversation ON conversation_summaries(tenant_id, conversation_id);
CREATE INDEX idx_tools_tenant_created ON tool_executions(tenant_id, created_at);
CREATE INDEX idx_handoffs_tenant_conversation ON handoffs(tenant_id, conversation_id);
CREATE INDEX idx_notifications_tenant_status ON sector_notifications(tenant_id, status);
CREATE INDEX idx_services_tenant_active ON appointment_services(tenant_id, is_active);
CREATE INDEX idx_providers_tenant_active ON appointment_providers(tenant_id, is_active);
CREATE INDEX idx_slots_tenant_window ON appointment_slots(tenant_id, starts_at, ends_at);
CREATE INDEX idx_appointments_tenant_status ON appointments(tenant_id, status);
CREATE INDEX idx_followups_tenant_pending
    ON followup_tasks(tenant_id, status, due_date) WHERE status = 'pending';
CREATE INDEX idx_documents_tenant_status ON knowledge_documents(tenant_id, status);
CREATE INDEX idx_chunks_tenant_document ON knowledge_chunks(tenant_id, document_id);
CREATE INDEX idx_ingestions_tenant_status ON telegram_ingestions(tenant_id, status);
CREATE INDEX idx_rules_tenant_active
    ON operational_rules(tenant_id, rule_type) WHERE is_active = true;
CREATE INDEX idx_analytics_tenant_timestamp ON analytics_events(tenant_id, timestamp);
CREATE INDEX idx_audit_events_tenant_created ON audit_events(tenant_id, created_at);
CREATE INDEX idx_feedback_tenant_created ON response_feedback(tenant_id, created_at);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_ingestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON conversations;
CREATE POLICY tenant_isolation ON conversations
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON messages;
CREATE POLICY tenant_isolation ON messages
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON contacts;
CREATE POLICY tenant_isolation ON contacts
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON pets;
CREATE POLICY tenant_isolation ON pets
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON customer_memories;
CREATE POLICY tenant_isolation ON customer_memories
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
CREATE POLICY tenant_isolation ON audit_logs
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON conversation_summaries;
CREATE POLICY tenant_isolation ON conversation_summaries
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON tool_executions;
CREATE POLICY tenant_isolation ON tool_executions
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON handoffs;
CREATE POLICY tenant_isolation ON handoffs
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON sector_notifications;
CREATE POLICY tenant_isolation ON sector_notifications
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON appointment_services;
CREATE POLICY tenant_isolation ON appointment_services
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON appointment_providers;
CREATE POLICY tenant_isolation ON appointment_providers
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON appointment_slots;
CREATE POLICY tenant_isolation ON appointment_slots
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON appointments;
CREATE POLICY tenant_isolation ON appointments
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON followup_tasks;
CREATE POLICY tenant_isolation ON followup_tasks
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON knowledge_documents;
CREATE POLICY tenant_isolation ON knowledge_documents
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON knowledge_chunks;
CREATE POLICY tenant_isolation ON knowledge_chunks
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON telegram_ingestions;
CREATE POLICY tenant_isolation ON telegram_ingestions
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON operational_rules;
CREATE POLICY tenant_isolation ON operational_rules
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON analytics_events;
CREATE POLICY tenant_isolation ON analytics_events
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON audit_events;
CREATE POLICY tenant_isolation ON audit_events
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
DROP POLICY IF EXISTS tenant_isolation ON response_feedback;
CREATE POLICY tenant_isolation ON response_feedback
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
