-- CVG Secretary Agent Database Schema
-- Phase 2: Memory persistent and relationships

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Phase 1: Core Tables (from Phase 1)
-- ============================================================================

-- Conversations table (minimal for Phase 1)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    chatwoot_conversation_id BIGINT NOT NULL,
    chatwoot_contact_id BIGINT NOT NULL,
    contact_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'open',
    contact_intake JSONB NOT NULL DEFAULT '{}'::JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (tenant_id, chatwoot_conversation_id),
    UNIQUE (tenant_id, id),
    CONSTRAINT conversations_contact_intake_object
        CHECK (jsonb_typeof(contact_intake) = 'object')
);

CREATE INDEX idx_conversations_chatwoot_id ON conversations(tenant_id, chatwoot_conversation_id);
CREATE INDEX idx_conversations_contact_id ON conversations(tenant_id, chatwoot_contact_id);
CREATE INDEX idx_conversations_status ON conversations(tenant_id, status);

-- Messages table (for Phase 1 minimal history)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    conversation_id UUID,
    chatwoot_message_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(20) NOT NULL, -- incoming, outgoing
    sender_type VARCHAR(20) NOT NULL, -- user, agent, bot
    sender_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_conversation_id ON messages(tenant_id, conversation_id);
CREATE INDEX idx_messages_created_at ON messages(tenant_id, created_at);
CREATE UNIQUE INDEX uk_messages_conversation_chatwoot_message
    ON messages(tenant_id, conversation_id, chatwoot_message_id);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    conversation_id UUID,
    contact_id UUID,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_conversation_id ON audit_logs(tenant_id, conversation_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(tenant_id, created_at);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(tenant_id, event_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update updated_at on conversations
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Phase 2: Contacts (stored separately from chatwoot for persistence)
-- ============================================================================

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    chatwoot_id INTEGER,  -- ID do contato no Chatwoot
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    whatsapp VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(2),
    postal_code VARCHAR(10),
    cpf VARCHAR(14),
    preferred_channel VARCHAR(20) DEFAULT 'chatwoot',
    notes TEXT,
    pii_encrypted JSONB NOT NULL DEFAULT '{}'::JSONB,
    name_lookup CHAR(64),
    email_lookup CHAR(64),
    phone_lookup CHAR(64),
    whatsapp_lookup CHAR(64),
    cpf_lookup CHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP,
    UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX uk_contacts_chatwoot_id ON contacts(tenant_id, chatwoot_id) WHERE chatwoot_id IS NOT NULL;
CREATE UNIQUE INDEX uk_contacts_phone_lookup ON contacts(tenant_id, phone_lookup) WHERE phone_lookup IS NOT NULL;
CREATE UNIQUE INDEX uk_contacts_email_lookup ON contacts(tenant_id, email_lookup) WHERE email_lookup IS NOT NULL;
CREATE INDEX idx_contacts_name_lookup ON contacts(tenant_id, name_lookup) WHERE name_lookup IS NOT NULL;
CREATE INDEX idx_contacts_whatsapp_lookup ON contacts(tenant_id, whatsapp_lookup) WHERE whatsapp_lookup IS NOT NULL;
CREATE INDEX idx_contacts_cpf_lookup ON contacts(tenant_id, cpf_lookup) WHERE cpf_lookup IS NOT NULL;

-- Trigger for contacts
CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Phase 2: Pets
-- ============================================================================

CREATE TABLE IF NOT EXISTS pets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    chatwoot_id INTEGER,  -- ID do contato relacionado no Chatwoot
    contact_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    species VARCHAR(50) NOT NULL,  -- 'cachorro', 'gato', 'pássaro', etc.
    breed VARCHAR(100),  -- raça
    birth_date DATE,
    age_years INTEGER,
    age_months INTEGER,
    gender VARCHAR(20),  -- 'macho', 'fêmea'
    weight DECIMAL(5,2),  -- em kg
    color VARCHAR(50),
    microchip VARCHAR(50),
    vaccination_status VARCHAR(50),
    medical_conditions TEXT,  -- condições médicas (sem dados sensíveis)
    behavior_notes TEXT,
    photo_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_pets_contact_id ON pets(tenant_id, contact_id);
CREATE INDEX idx_pets_name ON pets(tenant_id, name);
CREATE INDEX idx_pets_species ON pets(tenant_id, species);
CREATE INDEX idx_pets_chatwoot_id ON pets(tenant_id, chatwoot_id) WHERE chatwoot_id IS NOT NULL;
CREATE INDEX idx_pets_is_active ON pets(tenant_id, is_active) WHERE is_active = true;

-- Trigger for pets
CREATE TRIGGER update_pets_updated_at
    BEFORE UPDATE ON pets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Phase 2: Customer Memories (persistent memory)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    contact_id UUID NOT NULL,
    pet_id UUID,
    conversation_id UUID,
    category VARCHAR(50) NOT NULL,  -- 'contact_info', 'pet_info', 'preference', 'history', 'need'
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.0,
    source VARCHAR(20) NOT NULL,  -- 'extraction', 'user_confirmed', 'system', 'update'
    is_active BOOLEAN DEFAULT true,
    last_confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, pet_id)
        REFERENCES pets(tenant_id, id) ON DELETE SET NULL (pet_id),
    FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations(tenant_id, id) ON DELETE SET NULL (conversation_id)
);

CREATE INDEX idx_memories_contact_id ON customer_memories(tenant_id, contact_id);
CREATE INDEX idx_memories_pet_id ON customer_memories(tenant_id, pet_id);
CREATE INDEX idx_memories_category ON customer_memories(tenant_id, category);
CREATE INDEX idx_memories_key ON customer_memories(tenant_id, key);
CREATE INDEX idx_memories_contact_active ON customer_memories(tenant_id, contact_id, is_active) WHERE is_active = true;
CREATE INDEX idx_memories_contact_category ON customer_memories(tenant_id, contact_id, category) WHERE is_active = true;

-- Defense in depth for roles that do not own/bypass RLS. The application must set
-- app.tenant_id for each transaction when it runs under an RLS-enforced role.
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON conversations
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
CREATE POLICY tenant_isolation ON messages
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
CREATE POLICY tenant_isolation ON contacts
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
CREATE POLICY tenant_isolation ON pets
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
CREATE POLICY tenant_isolation ON customer_memories
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);

-- Trigger for memories
CREATE TRIGGER update_memories_updated_at
    BEFORE UPDATE ON customer_memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Phase 2: Conversation Summaries (enhanced from Phase 1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    conversation_id UUID NOT NULL,
    summary_text TEXT NOT NULL,
    key_points JSONB,  -- pontos principais extraídos
    extracted_facts JSONB,  -- facts extraídos
    intent VARCHAR(50),  -- intenção principal
    sentiment VARCHAR(20),  -- 'positive', 'neutral', 'negative'
    needs_handoff BOOLEAN DEFAULT false,
    handoff_reason VARCHAR(100),
    generated_by VARCHAR(50) DEFAULT 'openai',  -- 'openai', 'human'
    model_version VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_summaries_conversation_id ON conversation_summaries(tenant_id, conversation_id);
CREATE INDEX idx_summaries_intent ON conversation_summaries(tenant_id, intent);
CREATE INDEX idx_summaries_created_at ON conversation_summaries(tenant_id, created_at);

-- ============================================================================
-- Phase 2: Tool Executions (for auditing and debugging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tool_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    conversation_id UUID,
    contact_id UUID,
    tool_name VARCHAR(100) NOT NULL,
    tool_input JSONB NOT NULL,
    tool_output JSONB,
    status VARCHAR(20) NOT NULL,  -- 'success', 'error', 'timeout'
    error_message TEXT,
    duration_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations(tenant_id, id) ON DELETE SET NULL (conversation_id),
    FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts(tenant_id, id) ON DELETE SET NULL (contact_id)
);

CREATE INDEX idx_tool_executions_conversation_id ON tool_executions(tenant_id, conversation_id);
CREATE INDEX idx_tool_executions_contact_id ON tool_executions(tenant_id, contact_id);
CREATE INDEX idx_tool_executions_tool_name ON tool_executions(tenant_id, tool_name);
CREATE INDEX idx_tool_executions_status ON tool_executions(tenant_id, status);
CREATE INDEX idx_tool_executions_created_at ON tool_executions(tenant_id, created_at);

-- ============================================================================
-- Phase 2: Handoffs and Sector Notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS handoffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    conversation_id VARCHAR(255) NOT NULL,
    contact_id VARCHAR(255),
    trigger_type VARCHAR(100) NOT NULL,
    trigger_reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    summary TEXT,
    pending_questions JSONB DEFAULT '[]',
    what_was_answered TEXT,
    what_is_missing TEXT,
    risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolution_notes TEXT
);

CREATE INDEX idx_handoffs_conversation_id ON handoffs(tenant_id, conversation_id);
CREATE INDEX idx_handoffs_contact_id ON handoffs(tenant_id, contact_id);
CREATE INDEX idx_handoffs_status ON handoffs(tenant_id, status);
CREATE INDEX idx_handoffs_priority ON handoffs(tenant_id, priority);
CREATE INDEX idx_handoffs_created_at ON handoffs(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS sector_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    sector VARCHAR(50) NOT NULL,
    conversation_id VARCHAR(255),
    contact_id VARCHAR(255),
    message TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sector_notifications_sector ON sector_notifications(tenant_id, sector);
CREATE INDEX idx_sector_notifications_status ON sector_notifications(tenant_id, status);
CREATE INDEX idx_sector_notifications_conversation_id ON sector_notifications(tenant_id, conversation_id);
CREATE INDEX idx_sector_notifications_created_at ON sector_notifications(tenant_id, created_at);

-- ============================================================================
-- Phase 2: Transactional Scheduling
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointment_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    requires_human_approval BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS appointment_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    sector VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS appointment_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    service_id UUID,
    provider_id UUID,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'available',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT appointment_slots_time_order CHECK (ends_at > starts_at),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, service_id)
        REFERENCES appointment_services(tenant_id, id) ON DELETE SET NULL (service_id),
    FOREIGN KEY (tenant_id, provider_id)
        REFERENCES appointment_providers(tenant_id, id) ON DELETE SET NULL (provider_id)
);

CREATE INDEX idx_appointment_slots_window ON appointment_slots(tenant_id, starts_at, ends_at);
CREATE INDEX idx_appointment_slots_status ON appointment_slots(tenant_id, status);
CREATE INDEX idx_appointment_slots_service ON appointment_slots(tenant_id, service_id);

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    slot_id UUID NOT NULL,
    service_id UUID,
    provider_id UUID,
    conversation_id VARCHAR(255),
    contact_id VARCHAR(255),
    pet_id VARCHAR(255),
    tutor_name VARCHAR(255),
    pet_name VARCHAR(255),
    reason TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'reserved',
    reservation_expires_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(100) DEFAULT 'agent-secretary',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (tenant_id, slot_id)
        REFERENCES appointment_slots(tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, service_id)
        REFERENCES appointment_services(tenant_id, id) ON DELETE SET NULL (service_id),
    FOREIGN KEY (tenant_id, provider_id)
        REFERENCES appointment_providers(tenant_id, id) ON DELETE SET NULL (provider_id)
);

CREATE UNIQUE INDEX idx_appointments_active_slot
    ON appointments(tenant_id, slot_id)
    WHERE status IN ('reserved', 'confirmed');
CREATE INDEX idx_appointments_contact ON appointments(tenant_id, contact_id);
CREATE INDEX idx_appointments_conversation ON appointments(tenant_id, conversation_id);
CREATE INDEX idx_appointments_status ON appointments(tenant_id, status);

-- ============================================================================
-- Phase 2: Follow-up Tasks
-- ============================================================================

CREATE TABLE IF NOT EXISTS followup_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    conversation_id UUID,
    contact_id UUID,
    task_type VARCHAR(50) NOT NULL,  -- 'reminder', 'callback', 'confirmation', 'info'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    priority VARCHAR(20) DEFAULT 'medium',  -- 'low', 'medium', 'high'
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'cancelled'
    assigned_to VARCHAR(50),  -- 'human_agent', 'agent', 'system'
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations(tenant_id, id) ON DELETE SET NULL (conversation_id),
    FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts(tenant_id, id) ON DELETE SET NULL (contact_id)
);

CREATE INDEX idx_followups_conversation_id ON followup_tasks(tenant_id, conversation_id);
CREATE INDEX idx_followups_contact_id ON followup_tasks(tenant_id, contact_id);
CREATE INDEX idx_followups_status ON followup_tasks(tenant_id, status);
CREATE INDEX idx_followups_due_date ON followup_tasks(tenant_id, due_date);
CREATE INDEX idx_followups_pending ON followup_tasks(tenant_id, status, due_date) WHERE status = 'pending';

-- Trigger for followup_tasks
CREATE TRIGGER update_followup_tasks_updated_at
    BEFORE UPDATE ON followup_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Phase 3: Knowledge Base (RAG System)
-- ============================================================================

-- Knowledge documents (source content)
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,  -- 'faq', 'policy', 'procedure', 'service', 'orientation'
    status VARCHAR(20) DEFAULT 'draft',  -- 'draft', 'pending_review', 'approved', 'published', 'rejected'
    version INTEGER DEFAULT 1,
    source VARCHAR(50) DEFAULT 'manual',  -- 'telegram', 'manual', 'imported'
    source_id VARCHAR(100),  -- Original ID if imported
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_to TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (tenant_id, id)
);

CREATE INDEX idx_knowledge_documents_category ON knowledge_documents(tenant_id, category);
CREATE INDEX idx_knowledge_documents_status ON knowledge_documents(tenant_id, status);
CREATE INDEX idx_knowledge_documents_version ON knowledge_documents(tenant_id, version);
CREATE INDEX idx_knowledge_documents_active ON knowledge_documents(tenant_id, is_active) WHERE is_active = true;

-- Knowledge chunks (retrievable units)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    document_id UUID NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),  -- For pgvector, or use TEXT for external vector stores
    token_count INTEGER,
    -- Metadata fields for filtering
    title VARCHAR(500),
    category VARCHAR(50),
    tags JSONB DEFAULT '[]',
    version INTEGER DEFAULT 1,
    source VARCHAR(50),
    -- Tracking
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (tenant_id, document_id)
        REFERENCES knowledge_documents(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_knowledge_chunks_document_id ON knowledge_chunks(tenant_id, document_id);
CREATE INDEX idx_knowledge_chunks_category ON knowledge_chunks(tenant_id, category);
CREATE INDEX idx_knowledge_chunks_active ON knowledge_chunks(tenant_id, is_active) WHERE is_active = true;
-- For full-text search fallback (GIN index)
CREATE INDEX idx_knowledge_chunks_content_fts ON knowledge_chunks USING gin(to_tsvector('portuguese', content));

-- Trigger for knowledge_documents
CREATE TRIGGER update_knowledge_documents_updated_at
    BEFORE UPDATE ON knowledge_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for knowledge_chunks
CREATE TRIGGER update_knowledge_chunks_updated_at
    BEFORE UPDATE ON knowledge_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Note: For production with pgvector, uncomment:
-- CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops);

-- ============================================================================
-- Phase 5: Telegram Ingestion (Knowledge Self-Feeding)
-- ============================================================================

-- Telegram ingestions table - tracks all content received via Telegram
CREATE TABLE IF NOT EXISTS telegram_ingestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    -- Source information
    telegram_chat_id BIGINT,
    telegram_message_id BIGINT,
    source VARCHAR(50) NOT NULL DEFAULT 'telegram',  -- 'telegram', 'manual', 'api'
    -- Content
    raw_content TEXT NOT NULL,
    title VARCHAR(500),
    classified_type VARCHAR(50) NOT NULL,  -- 'faq', 'policy', 'procedure', 'rule', 'command', 'feedback', 'schedule', 'price', 'instruction'
    classification_confidence DECIMAL(3,2) DEFAULT 1.0,
    -- Routing decision
    destination VARCHAR(50) NOT NULL,  -- 'rag', 'postgres', 'both', 'rejected'
    target_table VARCHAR(50),  -- 'knowledge_documents', 'operational_rules', 'schedules', 'prices'
    -- Processing status
    status VARCHAR(30) NOT NULL DEFAULT 'pending',  -- 'pending', 'classified', 'validated', 'routed', 'processed', 'approved', 'published', 'rejected', 'failed'
    -- Content validation
    validation_errors JSONB DEFAULT '[]',
    content_length INTEGER,
    language VARCHAR(10) DEFAULT 'pt-BR',
    -- Metadata
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    -- Related entities
    knowledge_document_id UUID,
    -- Audit fields
    processed_by VARCHAR(100),
    processed_at TIMESTAMP WITH TIME ZONE,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, knowledge_document_id)
        REFERENCES knowledge_documents(tenant_id, id) ON DELETE SET NULL (knowledge_document_id)
);

CREATE INDEX idx_telegram_ingestions_status ON telegram_ingestions(tenant_id, status);
CREATE INDEX idx_telegram_ingestions_classified_type ON telegram_ingestions(tenant_id, classified_type);
CREATE INDEX idx_telegram_ingestions_destination ON telegram_ingestions(tenant_id, destination);
CREATE INDEX idx_telegram_ingestions_telegram_message ON telegram_ingestions(tenant_id, telegram_chat_id, telegram_message_id);
CREATE INDEX idx_telegram_ingestions_knowledge_doc ON telegram_ingestions(tenant_id, knowledge_document_id);
CREATE INDEX idx_telegram_ingestions_created_at ON telegram_ingestions(tenant_id, created_at);

-- Trigger for telegram_ingestions
CREATE TRIGGER update_telegram_ingestions_updated_at
    BEFORE UPDATE ON telegram_ingestions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Operational rules table (for structured data from ingestion)
CREATE TABLE IF NOT EXISTS operational_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL,  -- 'policy', 'schedule', 'handoff', 'security', 'pricing'
    content JSONB NOT NULL,  -- Structured content (e.g., { "day": "monday", "open": "07:00", "close": "19:00" })
    priority INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    source VARCHAR(50) DEFAULT 'telegram',  -- 'telegram', 'manual', 'imported'
    source_id UUID,
    status VARCHAR(20) DEFAULT 'draft',  -- 'draft', 'active', 'deprecated'
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_to TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (tenant_id, source_id)
        REFERENCES telegram_ingestions(tenant_id, id) ON DELETE SET NULL (source_id)
);

CREATE INDEX idx_operational_rules_type ON operational_rules(tenant_id, rule_type);
CREATE INDEX idx_operational_rules_status ON operational_rules(tenant_id, status);
CREATE INDEX idx_operational_rules_active ON operational_rules(tenant_id, is_active) WHERE is_active = true;

-- Trigger for operational_rules
CREATE TRIGGER update_operational_rules_updated_at
    BEFORE UPDATE ON operational_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Phase 6: Analytics Events (persistent storage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    conversation_id VARCHAR(255),
    contact_id VARCHAR(255),
    provider VARCHAR(50),
    latency INTEGER,
    outcome VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_analytics_events_type ON analytics_events(tenant_id, event_type);
CREATE INDEX idx_analytics_events_conversation ON analytics_events(tenant_id, conversation_id);
CREATE INDEX idx_analytics_events_timestamp ON analytics_events(tenant_id, timestamp);
CREATE INDEX idx_analytics_events_created ON analytics_events(tenant_id, created_at);

-- ============================================================================
-- Phase 5A: Audit Trail (governance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_events_type ON audit_events(tenant_id, event_type);
CREATE INDEX idx_audit_events_actor ON audit_events(tenant_id, actor);
CREATE INDEX idx_audit_events_resource ON audit_events(tenant_id, resource_type, resource_id);
CREATE INDEX idx_audit_events_created ON audit_events(tenant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uk_privacy_operation_started
    ON audit_events (tenant_id, resource_id)
    WHERE resource_type = 'privacy_operation' AND action = 'started';
CREATE UNIQUE INDEX IF NOT EXISTS uk_privacy_operation_completed_key
    ON audit_events (tenant_id, ((details->'receipt'->>'idempotencyKey')))
    WHERE resource_type = 'privacy_operation' AND action = 'completed';

-- ============================================================================
-- Response feedback used by the learning loop
-- ============================================================================

CREATE TABLE IF NOT EXISTS response_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
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

CREATE INDEX idx_response_feedback_tenant_created ON response_feedback(tenant_id, created_at);
CREATE INDEX idx_response_feedback_tenant_quality ON response_feedback(tenant_id, quality);
CREATE INDEX idx_response_feedback_tenant_failure ON response_feedback(tenant_id, failure_type)
    WHERE failure_type IS NOT NULL;

-- Tenant row-level security for all remaining persisted tables.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversation_summaries
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tool_executions
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON handoffs
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE sector_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sector_notifications
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointment_services
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE appointment_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointment_providers
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE appointment_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointment_slots
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointments
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE followup_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON followup_tasks
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON knowledge_documents
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON knowledge_chunks
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE telegram_ingestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telegram_ingestions
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE operational_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON operational_rules
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics_events
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
ALTER TABLE response_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON response_feedback
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
