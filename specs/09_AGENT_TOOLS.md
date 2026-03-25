# 09 - Ferramentas do Agente

## Visão Geral

As ferramentas (tools) são funções que o agente pode chamar durante uma conversa para executar ações específicas como buscar dados, salvar informações, criar agendamentos, etc. Este documento cataloga todas as ferramentas disponíveis.

## Catálogo de Ferramentas

### 1. find_contact

Busca informações de um cliente existente.

| Atributo | Valor |
|----------|-------|
| **Nome** | find_contact |
| **Objetivo** | Localizar dados de cliente por telefone, email ou nome |
| **Input** | `{ phone?: string, email?: string, name?: string }` |
| **Output** | `{ found: boolean, contact: Contact | null }` |

**Exemplo de Input**:
```json
{
  "phone": "11999999999"
}
```

**Exemplo de Output**:
```json
{
  "found": true,
  "contact": {
    "id": "uuid-123",
    "name": "Maria Santos",
    "email": "maria@email.com",
    "phone": "11999999999",
    "preferred_channel": "whatsapp"
  }
}
```

**Regras de Uso**:
- Pelo menos um campo de busca é obrigatório
- Retorna primeiro resultado se múltiplos encontrados

---

### 2. create_or_update_contact

Cria ou atualiza dados de um cliente.

| Atributo | Valor |
|----------|-------|
| **Nome** | create_or_update_contact |
| **Objetivo** | Criar novo cliente ou atualizar dados existentes |
| **Input** | `{ contactId?: string, name: string, phone?: string, email?: string, ... }` |
| **Output** | `{ success: boolean, contact: Contact }` |

**Exemplo de Input**:
```json
{
  "name": "Maria Santos",
  "phone": "11999999999",
  "email": "maria@email.com",
  "preferred_channel": "whatsapp"
}
```

**Regras de Uso**:
- Nome é obrigatório
- Se contactId fornecido, atualiza; caso contrário, cria novo

---

### 3. find_pet

Busca informações de um pet.

| Atributo | Valor |
|----------|-------|
| **Nome** | find_pet |
| **Objetivo** | Localizar dados de pet por nome, tutor ou ID |
| **Input** | `{ name?: string, contactId?: string, petId?: string }` |
| **Output** | `{ found: boolean, pets: Pet[] }` |

**Exemplo de Input**:
```json
{
  "contactId": "uuid-123"
}
```

**Regras de Uso**:
- Retorna array (um tutor pode ter múltiplos pets)
- Se nada informado, retorna lista vazia

---

### 4. create_or_update_pet

Cria ou atualiza dados de um pet.

| Atributo | Valor |
|----------|-------|
| **Nome** | create_or_update_pet |
| **Objetivo** | Criar novo pet ou atualizar dados existentes |
| **Input** | `{ petId?: string, contactId: string, name: string, species: string, ... }` |
| **Output** | `{ success: boolean, pet: Pet }` |

**Exemplo de Input**:
```json
{
  "contactId": "uuid-123",
  "name": "Buddy",
  "species": "cachorro",
  "breed": "Golden Retriever",
  "age_years": 5
}
```

**Regras de Uso**:
- contactId e name são obrigatórios
- species deve ser: cachorro, gato, pássaro, roedor, outro

---

### 5. save_memory

Salva um fact na memória persistente.

| Atributo | Valor |
|----------|-------|
| **Nome** | save_memory |
| **Objetivo** | Armazenar informação sobre cliente ou pet |
| **Input** | `{ contactId: string, petId?: string, category: string, key: string, value: any, confidence: number }` |
| **Output** | `{ success: boolean, memoryId: string }` |

**Exemplo de Input**:
```json
{
  "contactId": "uuid-123",
  "category": "pet_info",
  "key": "pet_nome",
  "value": "Buddy",
  "confidence": 0.95
}
```

**Regras de Uso**:
- confidence deve ser 0-1
- key única por contact+category

---

### 6. list_memories

Lista facts da memória de um contato.

| Atributo | Valor |
|----------|-------|
| **Nome** | list_memories |
| **Objetivo** | Recuperar informações previamente salvas |
| **Input** | `{ contactId: string, category?: string, activeOnly?: boolean }` |
| **Output** | `{ memories: Memory[] }` |

**Exemplo de Input**:
```json
{
  "contactId": "uuid-123",
  "category": "pet_info"
}
```

**Regras de Uso**:
- Retorna memórias ativas por padrão
- Puede filtrar por categoria

---

### 7. search_knowledge

Busca na base de conhecimento (RAG).

| Atributo | Valor |
|----------|-------|
| **Nome** | search_knowledge |
| **Objetivo** | Encontrar informações relevantes na base de conhecimento |
| **Input** | `{ query: string, category?: string, limit?: number }` |
| **Output** | `{ results: KnowledgeChunk[] }` |

**Exemplo de Input**:
```json
{
  "query": "horário de atendimento emergência",
  "limit": 3
}
```

**Exemplo de Output**:
```json
{
  "results": [
    {
      "id": "chunk-123",
      "text": "Nosso atendimento de emergência funciona 24h...",
      "source": "faq",
      "relevance": 0.95
    }
  ]
}
```

---

### 8. get_operational_rules

Busca regras operacionais vigentes.

| Atributo | Valor |
|----------|-------|
| **Nome** | get_operational_rules |
| **Objetivo** | Recuperar políticas e regras operacionais |
| **Input** | `{ ruleType?: string }` |
| **Output** | `{ rules: OperationalRule[] }` |

**Exemplo de Input**:
```json
{
  "ruleType": "policy"
}
```

**Tipos de Regras**:
- policy
- schedule
- handoff
- security

---

### 9. create_handoff

Cria um handoff (transferência para humano).

| Atributo | Valor |
|----------|-------|
| **Nome** | create_handoff |
| **Objetivo** | Transferir conversa para atendente humano |
| **Input** | `{ conversationId: string, contactId?: string, triggerType: string, triggerReason: string, summary: string, pendingQuestions: string[] }` |
| **Output** | `{ success: boolean, handoffId: string }` |

**Exemplo de Input**:
```json
{
  "conversationId": "conv-123",
  "triggerType": "urgency",
  "triggerReason": "Cliente reportou pet em emergência",
  "summary": "Pet está com dificuldade respiratória",
  "pendingQuestions": ["Qual a melhor unidade para emergência?"]
}
```

---

### 10. notify_sector

Notifica um setor específico.

| Atributo | Valor |
|----------|-------|
| **Nome** | notify_sector |
| **Objetivo** | Enviar notificação para equipe interna |
| **Input** | `{ sector: string, message: string, priority: string }` |
| **Output** | `{ success: boolean, notificationId: string }` |

**Setores**:
- `recepcao` - Recepção
- `clinico` - Time clínico
- `gerencia` - Gerência
- `financeiro` - Financeiro

**Prioridades**: low, medium, high, urgent

---

### 11. create_followup_task

Cria tarefa de follow-up.

| Atributo | Valor |
|----------|-------|
| **Nome** | create_followup_task |
| **Objetivo** | Criar lembrete para ação futura |
| **Input** | `{ conversationId?: string, contactId?: string, taskType: string, title: string, description?: string, dueDate?: string, priority?: string }` |
| **Output** | `{ success: boolean, taskId: string }` |

**Exemplo de Input**:
```json
{
  "conversationId": "conv-123",
  "taskType": "callback",
  "title": "Ligar para cliente sobre retorno",
  "description": "Cliente pediu para ligar em 3 dias",
  "dueDate": "2024-01-18T10:00:00Z",
  "priority": "medium"
}
```

---

### 12. log_summary

Gera e salva resumo da conversa.

| Atributo | Valor |
|----------|-------|
| **Nome** | log_summary |
| **Objetivo** | Criar resumo estruturado de conversa |
| **Input** | `{ conversationId: string, summaryText: string, keyPoints: string[], intent: string, sentiment: string, needsHandoff: boolean }` |
| **Output** | `{ success: boolean, summaryId: string }` |

---

### 13. ingest_telegram_content

Processa conteúdo enviado via Telegram para atualização de conhecimento.

| Atributo | Valor |
|----------|-------|
| **Nome** | ingest_telegram_content |
| **Objetivo** | Iniciar pipeline de ingestion de conhecimento |
| **Input** | `{ content: string, source: string, classification?: string }` |
| **Output** | `{ success: boolean, ingestionId: string, status: string }` |

**Uso**: Primariamente para admins, não para clientes.

---

### 14. register_tool_audit

Registra execução de ferramenta para auditoria.

| Atributo | Valor |
|----------|-------|
| **Nome** | register_tool_audit |
| **Objetivo** | Criar log de auditoria de execução |
| **Input** | `{ conversationId: string, toolName: string, toolInput: any, toolOutput?: any, status: string, errorMessage?: string, durationMs: number }` |
| **Output** | `{ success: boolean }` |

**Nota**: Esta ferramenta é chamada automaticamente pelo sistema após cada execução.

---

## Fluxo de Execução de Ferramentas

```
┌─────────────┐
│   LLM       │
│  Decide     │
│  tool call  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Validate   │
│  input      │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Execute   │────>│   Log       │
│   tool      │     │   audit     │
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│   Format    │
│   output    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Return to  │
│    LLM      │
└─────────────┘
```

## Regras de Execução

### Timeout
- Timeout máximo: 30 segundos por ferramenta
- Timeout para ferramentas externas: 15 segundos

### Retry
- Retry automático: 2 tentativas para erros temporários
- Sem retry para: erros de validação, dados não encontrados

### Rate Limiting
- Máximo de 10 chamadas de ferramentas por mensagem
- Máximo de 5 chamadas da mesma ferramenta por mensagem

### Erros

| Tipo de Erro | Comportamento |
|--------------|---------------|
| Timeout | Retentar 2x, depois retornar erro |
| Validation | Retornar erro detalhado para LLM |
| Not Found | Retornar null/empty normalmente |
| Rate Limit | Esperar e retentar |

## Riscos e Mitigações

| Ferramenta | Risco | Mitigação |
|------------|-------|-----------|
| create_or_update_contact | Dados duplicados | Verificar existência antes |
| create_or_update_pet | Dados incorretos | Validação de campos obrigatórios |
| create_handoff | Handoff desnecessário | Limiar de confiança |
| notify_sector | Notificação excessiva | Rate limiting por setor |
