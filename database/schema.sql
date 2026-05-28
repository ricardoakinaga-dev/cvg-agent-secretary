-- CVG Secretary Agent Database Schema
-- Phase 2: Memory persistent and relationships

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Phase 1: Core Tables (from Phase 1)
-- ============================================================================

-- Conversations table (minimal for Phase 1)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chatwoot_conversation_id BIGINT UNIQUE NOT NULL,
    chatwoot_contact_id BIGINT NOT NULL,
    contact_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'open',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_chatwoot_id ON conversations(chatwoot_conversation_id);
CREATE INDEX idx_conversations_contact_id ON conversations(chatwoot_contact_id);
CREATE INDEX idx_conversations_status ON conversations(status);

-- Messages table (for Phase 1 minimal history)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    chatwoot_message_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(20) NOT NULL, -- incoming, outgoing
    sender_type VARCHAR(20) NOT NULL, -- user, agent, bot
    sender_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    conversation_id UUID,
    contact_id UUID,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_conversation_id ON audit_logs(conversation_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE UNIQUE INDEX uk_contacts_chatwoot_id ON contacts(chatwoot_id) WHERE chatwoot_id IS NOT NULL;
CREATE UNIQUE INDEX uk_contacts_phone ON contacts(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX uk_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_name ON contacts(name);

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
    chatwoot_id INTEGER,  -- ID do contato relacionado no Chatwoot
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
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
    deleted_at TIMESTAMP
);

CREATE INDEX idx_pets_contact_id ON pets(contact_id);
CREATE INDEX idx_pets_name ON pets(name);
CREATE INDEX idx_pets_species ON pets(species);
CREATE INDEX idx_pets_chatwoot_id ON pets(chatwoot_id) WHERE chatwoot_id IS NOT NULL;
CREATE INDEX idx_pets_is_active ON pets(is_active) WHERE is_active = true;

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
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL,  -- 'contact_info', 'pet_info', 'preference', 'history', 'need'
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.0,
    source VARCHAR(20) NOT NULL,  -- 'extraction', 'user_confirmed', 'system', 'update'
    is_active BOOLEAN DEFAULT true,
    last_confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_memories_contact_id ON customer_memories(contact_id);
CREATE INDEX idx_memories_pet_id ON customer_memories(pet_id);
CREATE INDEX idx_memories_category ON customer_memories(category);
CREATE INDEX idx_memories_key ON customer_memories(key);
CREATE INDEX idx_memories_contact_active ON customer_memories(contact_id, is_active) WHERE is_active = true;
CREATE INDEX idx_memories_contact_category ON customer_memories(contact_id, category) WHERE is_active = true;

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
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    key_points JSONB,  -- pontos principais extraídos
    extracted_facts JSONB,  -- facts extraídos
    intent VARCHAR(50),  -- intenção principal
    sentiment VARCHAR(20),  -- 'positive', 'neutral', 'negative'
    needs_handoff BOOLEAN DEFAULT false,
    handoff_reason VARCHAR(100),
    generated_by VARCHAR(50) DEFAULT 'openai',  -- 'openai', 'human'
    model_version VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_summaries_conversation_id ON conversation_summaries(conversation_id);
CREATE INDEX idx_summaries_intent ON conversation_summaries(intent);
CREATE INDEX idx_summaries_created_at ON conversation_summaries(created_at);

-- ============================================================================
-- Phase 2: Tool Executions (for auditing and debugging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tool_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    tool_name VARCHAR(100) NOT NULL,
    tool_input JSONB NOT NULL,
    tool_output JSONB,
    status VARCHAR(20) NOT NULL,  -- 'success', 'error', 'timeout'
    error_message TEXT,
    duration_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tool_executions_conversation_id ON tool_executions(conversation_id);
CREATE INDEX idx_tool_executions_contact_id ON tool_executions(contact_id);
CREATE INDEX idx_tool_executions_tool_name ON tool_executions(tool_name);
CREATE INDEX idx_tool_executions_status ON tool_executions(status);
CREATE INDEX idx_tool_executions_created_at ON tool_executions(created_at);

-- ============================================================================
-- Phase 2: Handoffs and Sector Notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS handoffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX idx_handoffs_conversation_id ON handoffs(conversation_id);
CREATE INDEX idx_handoffs_contact_id ON handoffs(contact_id);
CREATE INDEX idx_handoffs_status ON handoffs(status);
CREATE INDEX idx_handoffs_priority ON handoffs(priority);
CREATE INDEX idx_handoffs_created_at ON handoffs(created_at);

CREATE TABLE IF NOT EXISTS sector_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX idx_sector_notifications_sector ON sector_notifications(sector);
CREATE INDEX idx_sector_notifications_status ON sector_notifications(status);
CREATE INDEX idx_sector_notifications_conversation_id ON sector_notifications(conversation_id);
CREATE INDEX idx_sector_notifications_created_at ON sector_notifications(created_at);

-- ============================================================================
-- Phase 2: Transactional Scheduling
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointment_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    requires_human_approval BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointment_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    sector VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointment_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID REFERENCES appointment_services(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES appointment_providers(id) ON DELETE SET NULL,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'available',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT appointment_slots_time_order CHECK (ends_at > starts_at)
);

CREATE INDEX idx_appointment_slots_window ON appointment_slots(starts_at, ends_at);
CREATE INDEX idx_appointment_slots_status ON appointment_slots(status);
CREATE INDEX idx_appointment_slots_service ON appointment_slots(service_id);

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE RESTRICT,
    service_id UUID REFERENCES appointment_services(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES appointment_providers(id) ON DELETE SET NULL,
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_appointments_active_slot
    ON appointments(slot_id)
    WHERE status IN ('reserved', 'confirmed');
CREATE INDEX idx_appointments_contact ON appointments(contact_id);
CREATE INDEX idx_appointments_conversation ON appointments(conversation_id);
CREATE INDEX idx_appointments_status ON appointments(status);

-- ============================================================================
-- Phase 2: Follow-up Tasks
-- ============================================================================

CREATE TABLE IF NOT EXISTS followup_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_followups_conversation_id ON followup_tasks(conversation_id);
CREATE INDEX idx_followups_contact_id ON followup_tasks(contact_id);
CREATE INDEX idx_followups_status ON followup_tasks(status);
CREATE INDEX idx_followups_due_date ON followup_tasks(due_date);
CREATE INDEX idx_followups_pending ON followup_tasks(status, due_date) WHERE status = 'pending';

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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_knowledge_documents_category ON knowledge_documents(category);
CREATE INDEX idx_knowledge_documents_status ON knowledge_documents(status);
CREATE INDEX idx_knowledge_documents_version ON knowledge_documents(version);
CREATE INDEX idx_knowledge_documents_active ON knowledge_documents(is_active) WHERE is_active = true;

-- Knowledge chunks (retrievable units)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);
CREATE INDEX idx_knowledge_chunks_category ON knowledge_chunks(category);
CREATE INDEX idx_knowledge_chunks_active ON knowledge_chunks(is_active) WHERE is_active = true;
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
    knowledge_document_id UUID REFERENCES knowledge_documents(id) ON DELETE SET NULL,
    -- Audit fields
    processed_by VARCHAR(100),
    processed_at TIMESTAMP WITH TIME ZONE,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_telegram_ingestions_status ON telegram_ingestions(status);
CREATE INDEX idx_telegram_ingestions_classified_type ON telegram_ingestions(classified_type);
CREATE INDEX idx_telegram_ingestions_destination ON telegram_ingestions(destination);
CREATE INDEX idx_telegram_ingestions_telegram_message ON telegram_ingestions(telegram_chat_id, telegram_message_id);
CREATE INDEX idx_telegram_ingestions_knowledge_doc ON telegram_ingestions(knowledge_document_id);
CREATE INDEX idx_telegram_ingestions_created_at ON telegram_ingestions(created_at);

-- Trigger for telegram_ingestions
CREATE TRIGGER update_telegram_ingestions_updated_at
    BEFORE UPDATE ON telegram_ingestions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Operational rules table (for structured data from ingestion)
CREATE TABLE IF NOT EXISTS operational_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL,  -- 'policy', 'schedule', 'handoff', 'security', 'pricing'
    content JSONB NOT NULL,  -- Structured content (e.g., { "day": "monday", "open": "07:00", "close": "19:00" })
    priority INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    source VARCHAR(50) DEFAULT 'telegram',  -- 'telegram', 'manual', 'imported'
    source_id UUID REFERENCES telegram_ingestions(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'draft',  -- 'draft', 'active', 'deprecated'
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_to TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_operational_rules_type ON operational_rules(rule_type);
CREATE INDEX idx_operational_rules_status ON operational_rules(status);
CREATE INDEX idx_operational_rules_active ON operational_rules(is_active) WHERE is_active = true;

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

CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_conversation ON analytics_events(conversation_id);
CREATE INDEX idx_analytics_events_timestamp ON analytics_events(timestamp);
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at);

-- ============================================================================
-- Phase 5A: Audit Trail (governance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_events_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_actor ON audit_events(actor);
CREATE INDEX idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX idx_audit_events_created ON audit_events(created_at);
