-- Phase 4: Handoff System Schema Extension
-- Based on specs/08_HANDOFF_SYSTEM.md

-- ============================================================================
-- Phase 4: Handoff Records
-- ============================================================================

-- Handoff tracking table
CREATE TABLE IF NOT EXISTS handoffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
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
    resolution_notes TEXT
);

CREATE INDEX idx_handoffs_conversation_id ON handoffs(conversation_id);
CREATE INDEX idx_handoffs_contact_id ON handoffs(contact_id);
CREATE INDEX idx_handoffs_status ON handoffs(status);
CREATE INDEX idx_handoffs_priority ON handoffs(priority);
CREATE INDEX idx_handoffs_trigger_type ON handoffs(trigger_type);
CREATE INDEX idx_handoffs_created_at ON handoffs(created_at);

-- ============================================================================
-- Phase 4: Operational Rules (for get_operational_rules tool)
-- ============================================================================

CREATE TABLE IF NOT EXISTS operational_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX idx_operational_rules_type ON operational_rules(rule_type);
CREATE INDEX idx_operational_rules_active ON operational_rules(is_active) WHERE is_active = true;

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
    sector VARCHAR(50) NOT NULL,  -- 'recepcao', 'clinico', 'gerencia', 'financeiro'
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',  -- 'low', 'medium', 'high', 'urgent'
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'sent', 'read', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sector_notifications_sector ON sector_notifications(sector);
CREATE INDEX idx_sector_notifications_status ON sector_notifications(status);
CREATE INDEX idx_sector_notifications_conversation_id ON sector_notifications(conversation_id);
CREATE INDEX idx_sector_notifications_created_at ON sector_notifications(created_at);

-- ============================================================================
-- Insert default operational rules
-- ============================================================================

-- Default handoff rules
INSERT INTO operational_rules (rule_type, name, description, content, priority) VALUES
(
    'handoff',
    'Emergência Clínica',
    'Situações de emergência que requerem transferência imediata',
    '{"triggers": ["pet não consegue respirar", "pet comeu veneno", "pet teve convulsão", "pet sangrando muito", "pet não consegue andar"], "action": "transferir_imediato", "priority": "critical"}',
    100
),
(
    'handoff',
    'Reclamação Grave',
    'Reclamações que precisam de intervenção humana',
    '{"triggers": ["quero falar com responsável", "absurdo", "procurar órgãos", "muito insatisfeito"], "action": "transferir", "priority": "high"}',
    90
),
(
    'handoff',
    'Financeiro Sensível',
    'Questões financeiras que requerem decisão humana',
    '{"triggers": ["não tenho como pagar", "reembolso", "discussão de valor"], "action": "transferir", "priority": "high"}',
    80
),
(
    'handoff',
    'Baixa Confiança',
    'Quando o agente não consegue responder com confiança',
    '{"min_confidence": 0.6, "action": "oferecer_verificacao", "priority": "medium"}',
    50
),
(
    'policy',
    'Horário de Atendimento',
    'Horários de funcionamento do hospital',
    '{"horario_normal": "7h às 19h", "sabado": "7h às 19h", "domingo": "8h às 14h", "emergencia": "24h"}',
    10
),
(
    'policy',
    'Serviços Disponíveis',
    'Lista de serviços oferecidos',
    '{"servicos": ["consulta", "vacina", "banho e tosa", "exames laboratoriais", "cirurgia", "internação", "emergência 24h", "radiografia", "ultrassonografia"]}',
    10
)
ON CONFLICT DO NOTHING;
