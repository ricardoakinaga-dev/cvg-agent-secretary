# 04 - Schema do Banco de Dados

## Visão Geral

Este documento define o schema lógico do banco de dados Postgres do CVG Secretary Agent. Todas as tabelas seguem convenções de nomenclatura em snake_case e utilizam UUIDs como chaves primárias.

## Convenções de Nomenclatura

| Convenção | Exemplo |
|-----------|---------|
| Tabelas | snake_case, plural `contacts`, `pets` |
| Colunas | snake_case `contact_id`, `created_at` |
| PK | `id` (UUID) |
| FK | `{tabela}_id` `contact_id` |
| indexes | `idx_contacts_phone` |
| Constraints | `uk_contacts_email` (unique) |

## Schema Detalhado

### contacts

Armazena dados dos tutores/clientes.

```sql
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE UNIQUE INDEX uk_contacts_chatwoot_id ON contacts(chatwoot_id) WHERE chatwoot_id IS NOT NULL;
CREATE UNIQUE INDEX uk_contacts_phone ON contacts(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX uk_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_name ON contacts(name);
```

### pets

Armazena dados dos animais de estimação.

```sql
CREATE TABLE pets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chatwoot_id INTEGER,  -- ID do contato relacionado no Chatwoot
    contact_id UUID NOT NULL REFERENCES contacts(id),
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_pets_contact_id ON pets(contact_id);
CREATE INDEX idx_pets_name ON pets(name);
CREATE INDEX idx_pets_species ON pets(species);
CREATE INDEX idx_pets_chatwoot_id ON pets(chatwoot_id) WHERE chatwoot_id IS NOT NULL;
```

### conversations

Armazena metadados das conversas.

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chatwoot_id INTEGER NOT NULL,  -- ID da conversa no Chatwoot
    inbox_id INTEGER NOT NULL,
    contact_id UUID REFERENCES contacts(id),
    assigned_agent_id INTEGER,
    status VARCHAR(20) DEFAULT 'open',  -- 'open', 'pending', 'closed', 'handoff'
    labels TEXT[],  -- labels do Chatwoot
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    last_message_at TIMESTAMP,
    handoff_at TIMESTAMP,  -- quando foi transferido para humano
    handoff_to_agent_id INTEGER,
    summary_id UUID REFERENCES conversation_summaries(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uk_conversations_chatwoot_id ON conversations(chatwoot_id);
CREATE INDEX idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_started_at ON conversations(started_at);
```

### conversation_messages

Armazena as mensagens trocadas em cada conversa.

```sql
CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    chatwoot_message_id INTEGER NOT NULL,
    message_type VARCHAR(20) NOT NULL,  -- 'incoming', 'outgoing'
    content TEXT NOT NULL,
    sender_type VARCHAR(20),  -- 'user', 'agent', 'system'
    sender_id INTEGER,
    is_internal BOOLEAN DEFAULT false,  -- nota interna
    attachments JSONB,  -- arquivos anexados
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uk_messages_chatwoot_id ON conversation_messages(chatwoot_message_id);
CREATE INDEX idx_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX idx_messages_created_at ON conversation_messages(created_at);
```

### conversation_summaries

Armazena resumos automáticos das conversas.

```sql
CREATE TABLE conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    summary_text TEXT NOT NULL,
    key_points JSONB,  -- pontos principais extraídos
    extracted_facts JSONB,  -- facts extraídos
    intent VARCHAR(50),  -- intenção principal
    sentiment VARCHAR(20),  -- 'positive', 'neutral', 'negative'
    needs_handoff BOOLEAN DEFAULT false,
    handoff_reason VARCHAR(100),
    generated_by VARCHAR(50) DEFAULT 'openai',  -- 'openai', 'human'
    model),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE_version VARCHAR(20 INDEX idx_summaries_conversation_id ON conversation_summaries(conversation_id);
CREATE INDEX idx_summaries_intent ON conversation_summaries(intent);
```

### customer_memories

Armazena facts estruturados extraídos das conversas (memória persistente).

```sql
CREATE TABLE customer_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id),
    pet_id UUID REFERENCES pets(id),
    conversation_id UUID REFERENCES conversations(id),
    category VARCHAR(50) NOT NULL,  -- 'contact_info', 'pet_info', 'preference', 'history', 'need'
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.0,
    source VARCHAR(20) NOT NULL,  -- 'extraction', 'user_confirmed', 'system'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_memories_contact_id ON customer_memories(contact_id);
CREATE INDEX idx_memories_pet_id ON customer_memories(pet_id);
CREATE INDEX idx_memories_category ON customer_memories(category);
CREATE INDEX idx_memories_key ON customer_memories(key);
CREATE INDEX idx_memories_contact_active ON customer_memories(contact_id, is_active) WHERE is_active = true;
```

### handoff_events

Registra todos os handoffs (transferências para humano).

```sql
CREATE TABLE handoff_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    contact_id UUID REFERENCES contacts(id),
    trigger_type VARCHAR(50) NOT NULL,  -- 'urgency', 'complexity', 'low_confidence', 'error', 'request'
    trigger_reason TEXT,
    summary_before TEXT,  -- resumo da conversa até o momento
    pending_questions TEXT,  -- perguntas pendentes do cliente
    created_by VARCHAR(50) DEFAULT 'agent',
    assigned_to_agent_id INTEGER,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_handoffs_conversation_id ON handoff_events(conversation_id);
CREATE INDEX idx_handoffs_trigger_type ON handoff_events(trigger_type);
CREATE INDEX idx_handoffs_created_at ON handoff_events(created_at);
```

### followup_tasks

Armazena tarefas de follow-up criadas pelo agente ou humanos.

```sql
CREATE TABLE followup_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    contact_id UUID REFERENCES contacts(id),
    task_type VARCHAR(50) NOT NULL,  -- 'reminder', 'callback', 'confirmation', 'info'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP,
    priority VARCHAR(20) DEFAULT 'medium',  -- 'low', 'medium', 'high'
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'cancelled'
    assigned_to VARCHAR(50),  -- 'human_agent', 'agent', 'system'
    completed_at TIMESTAMP,
    completed_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_followups_conversation_id ON followup_tasks(conversation_id);
CREATE INDEX idx_followups_contact_id ON followup_tasks(contact_id);
CREATE INDEX idx_followups_status ON followup_tasks(status);
CREATE INDEX idx_followups_due_date ON followup_tasks(due_date);
```

### knowledge_documents

Catálogo de documentos da base de conhecimento.

```sql
CREATE TABLE knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) NOT NULL,  -- 'faq', 'policy', 'procedure', 'service', 'internal'
    content TEXT NOT NULL,
    source VARCHAR(50),  -- 'telegram', 'manual', 'import'
    source_reference VARCHAR(255),  -- referência externa (message_id do Telegram)
    status VARCHAR(20) DEFAULT 'draft',  -- 'draft', 'pending_review', 'approved', 'published', 'archived'
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES knowledge_documents(id),
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    published_at TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_content_type ON knowledge_documents(content_type);
CREATE INDEX idx_documents_status ON knowledge_documents(status);
CREATE INDEX idx_documents_source ON knowledge_documents(source);
```

### knowledge_chunks

Chunks vectorizados dos documentos (para RAG).

```sql
CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id),
    chunk_text TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    vector_id VARCHAR(255),  -- ID no vector store (Pinecone/Qdrant)
    embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',
    metadata JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chunks_document_id ON knowledge_chunks(document_id);
CREATE INDEX idx_chunks_is_active ON knowledge_chunks(is_active);
-- Index para busca full-text (PostgreSQL)
CREATE INDEX idx_chunks_text_fts ON knowledge_chunks USING gin(to_tsvector('portuguese', chunk_text));
```

### telegram_ingestions

Log de ingestões vindas do Telegram.

```sql
CREATE TABLE telegram_ingestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id INTEGER NOT NULL,
    chat_id BIGINT NOT NULL,
    user_id BIGINT,
    message_type VARCHAR(30) NOT NULL,  -- 'text', 'document', 'photo'
    content TEXT,
    file_id VARCHAR(255),
    file_type VARCHAR(50),
    classification VARCHAR(50),  -- 'knowledge', 'rule', 'command', 'feedback'
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'processing', 'approved', 'rejected', 'failed'
    processed_by VARCHAR(50),
    destination_table VARCHAR(50),  -- 'knowledge_documents', 'operational_rules', etc.
    destination_id UUID,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

CREATE UNIQUE INDEX uk_telegram_message ON telegram_ingestions(message_id, chat_id);
CREATE INDEX idx_telegram_status ON telegram_ingestions(status);
CREATE INDEX idx_telegram_classification ON telegram_ingestions(classification);
```

### agent_audit_logs

Logs de auditoria de todas as operações do agente.

```sql
CREATE TABLE agent_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID,
    contact_id UUID,
    event_type VARCHAR(50) NOT NULL,  -- 'message_received', 'tool_called', 'handoff', etc.
    event_data JSONB,
    level VARCHAR(20) DEFAULT 'info',  -- 'debug', 'info', 'warn', 'error'
    source VARCHAR(50) NOT NULL,  -- 'runtime', 'worker', 'tool'
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_conversation_id ON agent_audit_logs(conversation_id);
CREATE INDEX idx_audit_contact_id ON agent_audit_logs(contact_id);
CREATE INDEX idx_audit_event_type ON agent_audit_logs(event_type);
CREATE INDEX idx_audit_created_at ON agent_audit_logs(created_at);
-- Particionar por mês se volume for alto
```

### tool_executions

Registro de todas as execuções de ferramentas.

```sql
CREATE TABLE tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    tool_name VARCHAR(100) NOT NULL,
    tool_input JSONB NOT NULL,
    tool_output JSONB,
    status VARCHAR(20) NOT NULL,  -- 'success', 'error', 'timeout'
    error_message TEXT,
    duration_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tool_executions_conversation_id ON tool_executions(conversation_id);
CREATE INDEX idx_tool_executions_tool_name ON tool_executions(tool_name);
CREATE INDEX idx_tool_executions_status ON tool_executions(status);
CREATE INDEX idx_tool_executions_created_at ON tool_executions(created_at);
```

### service_catalog

Catálogo de serviços oferecidos pelo hospital.

```sql
CREATE TABLE service_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,  -- 'consultation', 'procedure', 'exam', 'grooming'
    duration_minutes INTEGER,  -- duração média em minutos
    price DECIMAL(10,2),
    price_description VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    requires_appointment BOOLEAN DEFAULT true,
    requires_fasting BOOLEAN DEFAULT false,
    preparation_notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_service_catalog_category ON service_catalog(category);
CREATE INDEX idx_service_catalog_is_active ON service_catalog(is_active);
```

### operational_rules

Regras operacionais do sistema.

```sql
CREATE TABLE operational_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) NOT NULL,  -- 'policy', 'schedule', 'handoff', 'security'
    description TEXT,
    content TEXT NOT NULL,  -- regra em si (pode ser JSON, texto, etc.)
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    effective_from TIMESTAMP,
    effective_until TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_operational_rules_type ON operational_rules(rule_type);
CREATE INDEX idx_operational_rules_is_active ON operational_rules(is_active);
```

## Relações entre Tabelas

```
contacts (1) ──────< (N) pets
contacts (1) ──────< (N) conversations
contacts (1) ──────< (N) customer_memories
contacts (1) ──────< (N) handoff_events
contacts (1) ──────< (N) followup_tasks

pets (1) ──────< (N) customer_memories

conversations (1) ──────< (N) conversation_messages
conversations (1) ──────< (1) conversation_summaries
conversations (1) ──────< (N) handoff_events
conversations (1) ──────< (N) tool_executions
conversations (1) ──────< (N) followup_tasks

knowledge_documents (1) ──────< (N) knowledge_chunks
```

## Observações de Implementação

### Índice Compound para Queries Frequentes

```sql
-- Busca de memories ativas por contact
CREATE INDEX idx_memories_contact_category ON customer_memories(contact_id, category) WHERE is_active = true;

-- Busca de follow-ups pendentes
CREATE INDEX idx_followups_pending ON followup_tasks(status, due_date) WHERE status = 'pending';
```

### Dados JSONB

Tabelas com campos JSONB para flexibilidade:

- `conversation_messages.metadata`: metadados da mensagem
- `customer_memories.value`: valor do fact
- `conversation_summaries.key_points`: pontos extraídos
- `knowledge_documents.metadata`: metadados do documento
- `tool_executions.tool_input/output`: dados da execução
- `agent_audit_logs.metadata`: metadados do log

### Retenção de Dados

| Tabela | Retenção | Ação |
|--------|----------|------|
| agent_audit_logs | 1 ano | Arquivar para cold storage |
| conversation_messages | 90 dias | Deletar ou anonimizar |
| tool_executions | 6 meses | Agregar para analytics |
| knowledge_chunks | Indefinido | Manter com versionamento |
| customer_memories | Indefinido | Manter (dados importantes) |
