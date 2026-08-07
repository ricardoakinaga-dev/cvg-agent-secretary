-- Phase 4: Handoff System Schema Extension
-- Based on specs/08_HANDOFF_SYSTEM.md
-- Required for default rule ownership:
-- PGOPTIONS='-c app.migration_tenant_id=123' psql "$DATABASE_URL" --single-transaction --file=database/handoff_schema.sql

-- ============================================================================
-- Phase 4: Handoff Records
-- ============================================================================

-- Handoff tracking table
CREATE TABLE IF NOT EXISTS handoffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    conversation_id UUID NOT NULL,
    contact_id UUID,
    -- Trigger information
    trigger_type VARCHAR(50) NOT NULL,  -- 'urgency', 'complaint', 'financial', 'low_confidence', 'tool_error', 'explicit_request'
    trigger_reason TEXT NOT NULL,
    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'cancelled'
    -- Priority
    priority VARCHAR(20) DEFAULT 'medium',  -- 'low', 'medium', 'high', 'critical'
    -- Summary for human agent
    summary TEXT,
    pending_questions JSONB,  -- Array of pending questions
    what_was_answered TEXT,  -- What the agent already responded
    what_is_missing TEXT,    -- What still needs resolution
    -- Risk assessment
    risk_level VARCHAR(20) DEFAULT 'low',  -- 'low', 'medium', 'high'
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    -- Resolution
    resolved_by VARCHAR(50),  -- Agent ID who resolved
    resolution_notes TEXT,
    FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts(tenant_id, id) ON DELETE SET NULL (contact_id)
);

CREATE INDEX idx_handoffs_conversation_id ON handoffs(tenant_id, conversation_id);
CREATE INDEX idx_handoffs_contact_id ON handoffs(tenant_id, contact_id);
CREATE INDEX idx_handoffs_status ON handoffs(tenant_id, status);
CREATE INDEX idx_handoffs_priority ON handoffs(tenant_id, priority);
CREATE INDEX idx_handoffs_trigger_type ON handoffs(tenant_id, trigger_type);
CREATE INDEX idx_handoffs_created_at ON handoffs(tenant_id, created_at);

-- ============================================================================
-- Phase 4: Operational Rules (for get_operational_rules tool)
-- ============================================================================

CREATE TABLE IF NOT EXISTS operational_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    rule_type VARCHAR(50) NOT NULL,  -- 'policy', 'schedule', 'handoff', 'security', 'pricing'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content JSONB NOT NULL,  -- The actual rule content
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,  -- Higher = more important
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    effective_to TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_operational_rules_type ON operational_rules(tenant_id, rule_type);
CREATE INDEX idx_operational_rules_active ON operational_rules(tenant_id, is_active) WHERE is_active = true;

-- Trigger for updating timestamp
CREATE TRIGGER update_operational_rules_updated_at
    BEFORE UPDATE ON operational_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Phase 4: Sector Notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS sector_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,
    sector VARCHAR(50) NOT NULL,  -- 'recepcao', 'clinico', 'gerencia', 'financeiro'
    conversation_id UUID,
    contact_id UUID,
    message TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',  -- 'low', 'medium', 'high', 'urgent'
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'sent', 'read', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations(tenant_id, id) ON DELETE SET NULL (conversation_id),
    FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts(tenant_id, id) ON DELETE SET NULL (contact_id)
);

CREATE INDEX idx_sector_notifications_sector ON sector_notifications(tenant_id, sector);
CREATE INDEX idx_sector_notifications_status ON sector_notifications(tenant_id, status);
CREATE INDEX idx_sector_notifications_conversation_id ON sector_notifications(tenant_id, conversation_id);
CREATE INDEX idx_sector_notifications_created_at ON sector_notifications(tenant_id, created_at);

ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON handoffs
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
CREATE POLICY tenant_isolation ON operational_rules
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);
CREATE POLICY tenant_isolation ON sector_notifications
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);

-- ============================================================================
-- Insert default operational rules
-- ============================================================================

-- Default handoff rules
INSERT INTO operational_rules (tenant_id, rule_type, name, description, content, priority) VALUES
(
    current_setting('app.migration_tenant_id', true)::BIGINT,
    'handoff',
    'Emergência Clínica',
    'Situações de emergência que requerem transferência imediata',
    '{"triggers": ["pet não consegue respirar", "pet comeu veneno", "pet teve convulsão", "pet sangrando muito", "pet não consegue andar"], "action": "transferir_imediato", "priority": "critical"}',
    100
),
(
    current_setting('app.migration_tenant_id', true)::BIGINT,
    'handoff',
    'Reclamação Grave',
    'Reclamações que precisam de intervenção humana',
    '{"triggers": ["quero falar com responsável", "absurdo", "procurar órgãos", "muito insatisfeito"], "action": "transferir", "priority": "high"}',
    90
),
(
    current_setting('app.migration_tenant_id', true)::BIGINT,
    'handoff',
    'Financeiro Sensível',
    'Questões financeiras que requerem decisão humana',
    '{"triggers": ["não tenho como pagar", "reembolso", "discussão de valor"], "action": "transferir", "priority": "high"}',
    80
),
(
    current_setting('app.migration_tenant_id', true)::BIGINT,
    'handoff',
    'Baixa Confiança',
    'Quando o agente não consegue responder com confiança',
    '{"min_confidence": 0.6, "action": "oferecer_verificacao", "priority": "medium"}',
    50
),
(
    current_setting('app.migration_tenant_id', true)::BIGINT,
    'policy',
    'Horário de Atendimento',
    'Horários de funcionamento do hospital',
    '{"horario_normal": "7h às 19h", "sabado": "7h às 19h", "domingo": "8h às 14h", "emergencia": "24h"}',
    10
),
(
    current_setting('app.migration_tenant_id', true)::BIGINT,
    'policy',
    'Serviços Disponíveis',
    'Lista de serviços oferecidos',
    '{"servicos": ["consulta", "vacina", "banho e tosa", "exames laboratoriais", "cirurgia", "internação", "emergência 24h", "radiografia", "ultrassonografia"]}',
    10
)
ON CONFLICT DO NOTHING;
