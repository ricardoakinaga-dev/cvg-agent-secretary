# 03 - Arquitetura de Memória

## Visão Geral

O sistema de memória do CVG Secretary Agent é dividido em três camadas distintas que trabalham em conjunto para proporcionar um atendimento contextualizado e personalizado:

1. **Memória de Curto Prazo** (Redis): Contexto imediato da conversa atual
2. **Memória Persistente** (Postgres): Facts extraídos e histórico estruturado
3. **Memória Semântica** (Vector Store): Busca por similaridade em conhecimento

## Memória de Curto Prazo (Redis)

### Propósito

Armazenar o contexto imediato da conversa em andamento, permitindo que o agente mantenha coerência durante a interação atual sem precisar consultar o banco de dados a cada mensagem.

### Estrutura

```
conversation:{conversationId}:state
├── messages: [
│   { role: "user", content: "...", timestamp: "..." },
│   { role: "assistant", content: "...", timestamp: "..." }
│ ]
├── context: {
│   contact_id: "uuid",
│   contact_name: "Maria",
│   pet_ids: ["uuid1", "uuid2"],
│   current_intent: "agendamento",
│   state: "collecting_pet_name",
│   variables: { pet_name: null, preferred_date: null }
│ }
├── metadata: {
│   started_at: "ISO timestamp",
│   last_activity: "ISO timestamp",
│   message_count: 5,
│   is_awaiting_handoff: false
│ }
```

### TTL (Time to Live)

| Dado | TTL | Razão |
|------|-----|-------|
| Estado de conversa | 24 horas | Permite continuidade se cliente retornar no mesmo dia |
| Mensagens recentes | 24 horas | Contexto para resposta atual |
| Lock de processamento | 5 minutos | Prevenir processamento duplicado |

### Limites

- Máximo de 50 mensagens armazenadas por conversa ( sliding window)
- Máximo de 1KB por variável de contexto
- Limpeza automática de conversas inativas há mais de 24h

## Memória Persistente (Postgres)

### Propósito

Armazenar facts estruturados extraídos das conversas, permitindo recuperação em conversas futuras e continuidade do atendimento.

### Tabela: customer_memories

Armazena facts individuais sobre clientes e pets.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| contact_id | UUID | Referência ao contact |
| pet_id | UUID (nullable) | Referência ao pet (se aplicável) |
| conversation_id | UUID | Conversa de origem |
| category | VARCHAR(50) | Categoria do fact |
| key | VARCHAR(100) | Chave do fact |
| value | JSONB | Valor do fact |
| confidence | DECIMAL(3,2) | Score de confiança (0-1) |
| source | VARCHAR(20) | Fonte: "extraction", "user_confirmed", "system" |
| is_active | BOOLEAN | Se ainda válido |
| created_at | TIMESTAMP | Data de criação |
| updated_at | TIMESTAMP | Data de atualização |

### Categorias de Facts

| Categoria | Descrição | Exemplo |
|-----------|-----------|---------|
| contact_info | Dados do tutor | {telefone: "11999999999"} |
| pet_info | Dados do pet | {nome: "Buddy", especie: "cachorro"} |
| preference | Preferências | {prefere_whatsapp: true} |
| history | Histórico | {ultima_visita: "2024-01-15"} |
| need | Necessidades | {precisa_banho: true} |

### Critérios para Salvar Memória

Um fact deve ser salvo quando:

1. **Extraído com confiança ≥ 0.8** e validado pelo usuário
2. **Explicitamente confirmado** pelo cliente
3. **Atualiza informação existente** (override)
4. **Referência explícita** a dados pessoais

### Critérios para NÃO Salvar

Não salvar quando:

1. **Confiança < 0.8** sem confirmação do usuário
2. **Informação contraditória** não resolvida
3. **Dados temporários** (ex: "estou passando pela clínica")
4. **Speculação** do agente sem validação
5. **Dados sensíveis** não explicitamente autorizados

## Score de Confiança

### Cálculo

O score de confiança é calculado automaticamente para cada fact extraído:

```
confidence = base_score * validation_multiplier * recency_multiplier

Onde:
- base_score: 0.0 a 1.0 (baseado na clareza da extração)
- validation_multiplier: 1.5 se confirmado pelo usuário, 1.0 se inferido
- recency_multiplier: 1.0 (sempre 1.0 no MVP)
```

### Thresholds

| Score | Ação |
|-------|------|
| ≥ 0.9 | Salvar automaticamente |
| 0.7 - 0.89 | Salvar após 1 confirmação implícita |
| < 0.7 | Não salvar até confirmação explícita |

### Atualização de Memória

Quando nova informação contradiz existente:

1. Marcar fact antigo como `is_active = false`
2. Criar novo fact com `source = "update"`
3. Manter histórico de alterações para auditoria

## Confirmação de Fatos

### Tipos de Confirmação

#### Implícita
```
Cliente: "Meu doguinho Max é muito guloso"
Agente: "Que Legal! Max parece adorar comer. 🐕 Posso guardar isso?"
```
**Validação**: Cliente não corrije, continua conversa

#### Explícita
```
Cliente: "O telefone é 11988887777"
Agente: "Confirmando: Seu telefone é 11988887777. Está correto?"
```
**Valores altos (>0.9) não precisam de confirmação explícita**

## Diferença entre Histórico Bruto e Memória Útil

### Histórico Bruto

Formato raw das mensagens trocadas:
- Inclui saudações, despedidas, off-topic
- Não estruturado
- Difícil de processar para contexto
- Tamanho grande
- Usado para: Resumo de conversa, auditoria

### Memória Útil

Facts estruturados extraídos:
- Apenas informações relevantes
- Estruturado e pesquisável
- Fácil de usar como contexto
- Tamanho pequeno
- Usado para: Contexto de próxima conversa, personalização

### Processo de Extração

```
1. Conversa termina (sem resposta por 10 min ou handoff)
2. Worker de resumo analisa conversa
3. Extrai facts com NER e classification
4. Calcula confidence score
5. Salva facts na tabela customer_memories
6. Gera summary na tabela conversation_summaries
```

## Expiração e Limpeza

### Política de Expiração

| Tipo de Memória | Tempo de Retenção | Motivo |
|-----------------|-------------------|--------|
| Facts de contact_info | Indefinido | Dados básicos do cliente |
| Facts de pet_info | Indefinido | Dados básicos do pet |
| Facts de preference | 2 anos | Preferências podem mudar |
| Facts de history | 3 anos | Histórico relevante |
| Facts de need | 6 meses | Necessidades desatualizadas |
| Histórico de mensagens | 90 dias | LGPD e performance |

### Limpeza Automática

- Job diário remove facts com is_active=false há mais de 30 dias
- Facts expirados são arquivados antes de deletados
- Limpeza de logsOlder than retention policy

## Auditoria

### Trilha de Auditoria

Toda operação de memória gera log:

```json
{
  "event": "memory_saved",
  "timestamp": "2024-01-15T10:30:00Z",
  "contact_id": "uuid",
  "fact_key": "pet_nome",
  "fact_value": "Buddy",
  "confidence": 0.95,
  "source": "extraction",
  "conversation_id": "uuid",
  "user_id": "system"
}
```

### Eventos Auditados

| Evento | logging Necessário |
|--------|-------------------|
| Fact criado | Sempre |
| Fact atualizado | Sempre |
| Fact desativado | Sempre |
| Memória consultada | Opcional (alta frequência) |
| Expiração aplicada | Sempre |
| Limpeza executada | Sempre |

## API de Memória

### Operações

```typescript
// Salvar fact
saveMemory(contactId: string, category: string, key: string, value: any, confidence: number): Promise<Memory>

// Buscar facts por contact
listMemories(contactId: string, category?: string, activeOnly?: boolean): Promise<Memory[]>

// Buscar facts por pet
getPetMemories(petId: string): Promise<Memory[]>

// Atualizar fact
updateMemory(memoryId: string, updates: Partial<Memory>): Promise<Memory>

// Desativar fact
deactivateMemory(memoryId: string): Promise<void>

// Buscar facts por similaridade (para contexto)
searchMemoriesByContext(contactId: string, context: string): Promise<Memory[]>
```

## Casos de Uso

### Caso 1: Cliente Retorna Após 1 Mês

```
1. Cliente envia mensagem
2. Sistema carrega contact_id da conversa
3. Busca memories ativas do contact
4. Contexto inclui: "Maria, telefone 11988887777, pet Buddy"
5. Agente saudação personalizada: "Olá Maria! Como posso ajudar?"
```

### Caso 2: Novo Pet Informado

```
1. Cliente: "Tenho um novo pet, a Luna"
2. Sistema extrai fact: {pet_nome: "Luna"}
3. Confidence = 0.85
4. Salva em customer_memories com category="pet_info"
5. Próxima conversa pode buscar pets do contact
```

### Caso 3: Informação Conflitante

```
1. Cliente em conversa anterior: "Meu pet se chama Max"
2. Cliente agora: "Meu pet se chamaBuddy"
3. Sistema detecta conflito
4. Salva novo fact (Buddy)
5. Marca fact antigo (Max) como is_active=false
6. Opcional: pergunta para confirmar
```
