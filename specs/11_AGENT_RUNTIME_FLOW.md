# 11 - Fluxo de Execução do Agente

## Visão Geral

Este documento descreve o ciclo operacional completo do agente, desde o recebimento de uma mensagem até a resposta final ao cliente.

## Diagrama Textual do Fluxo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUXO DO AGENTE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐                                                            │
│  │ 1. Receber  │                                                            │
│  │  Evento     │                                                            │
│  └──────┬──────┘                                                            │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────┐                                         │
│  │ 2. Normalizar│────>│ 3. Deduplicar│                                        │
│  │  Mensagem   │     │  (Redis)    │                                        │
│  └──────┬──────┘     └──────┬──────┘                                         │
│         │                   │                                                │
│         │            Sim    │    Não                                         │
│         │           ┌────────┴────────┐                                       │
│         │           │                 │                                       │
│         │           ▼                 ▼                                       │
│         │    ┌─────────────┐   ┌─────────────┐                               │
│         │    │  Ignorar    │   │  Continuar  │                               │
│         │    │  (dup)     │   │  Processar  │                               │
│         │    └─────────────┘   └──────┬──────┘                               │
│         │                             │                                       │
│         │                             ▼                                       │
│         │                    ┌─────────────┐                                 │
│         │                    │ 4. Carregar│                                 │
│         │                    │  Contexto   │                                 │
│         │                    │  (Redis)    │                                 │
│         │                    └──────┬──────┘                                 │
│         │                             │                                       │
│         │                             ▼                                       │
│         │                    ┌─────────────┐                                 │
│         │                    │ 5. Buscar   │                                 │
│         │                    │ Memória     │                                 │
│         │                    │ (Postgres)  │                                 │
│         │                    └──────┬──────┘                                 │
│         │                             │                                       │
│         │                             ▼                                       │
│         │                    ┌─────────────┐                                 │
│         │                    │ 6. Buscar   │                                 │
│         │                    │ Conhecimento│                                 │
│         │                    │ (RAG)       │                                 │
│         │                    └──────┬──────┘                                 │
│         │                             │                                       │
│         │                             ▼                                       │
│         │                    ┌─────────────┐                                 │
│         │                    │ 7. Chamar   │                                 │
│         │                    │ LLM         │                                 │
│         │                    │ + Ferramentas│                                │
│         │                    └──────┬──────┘                                 │
│         │                             │                                       │
│         │                    ┌────────┴────────┐                             │
│         │                    │                 │                              │
│         │              Sucesso           Erro                              │
│         │                    │                 │                              │
│         │                    ▼                 ▼                              │
│         │            ┌─────────────┐   ┌─────────────┐                      │
│         │            │8. Validar   │   │9. Tratar Erro│                     │
│         │            │Saída        │   │             │                      │
│         │            └──────┬──────┘   └──────┬──────┘                      │
│         │                   │                   │                             │
│         │                   └────────┬────────┘                              │
│         │                            │                                       │
│         │                            ▼                                       │
│         │                   ┌─────────────┐                                 │
│         │                   │10. Responder│                                 │
│         │                   │(Chatwoot)   │                                 │
│         │                   └──────┬──────┘                                 │
│         │                            │                                       │
│         │                            ▼                                       │
│         │                   ┌─────────────┐                                 │
│         │                   │11. Resumir │                                 │
│         │                   │Conversa     │                                 │
│         │                   │(Async)      │                                 │
│         │                   └──────┬──────┘                                 │
│         │                            │                                       │
│         │                            ▼                                       │
│         │                   ┌─────────────┐                                 │
│         │                   │12. Salvar   │                                 │
│         │                   │Memória      │                                 │
│         │                   │(Async)      │                                 │
│         │                   └──────┬──────┘                                 │
│         │                            │                                       │
│         │                            ▼                                       │
│         │                   ┌─────────────┐                                 │
│         │                   │13. Registrar│                                 │
│         │                   │Auditoria    │                                 │
│         │                   │(Async)      │                                 │
│         │                   └──────┬──────┘                                 │
│         │                            │                                       │
│         ▼                            ▼                                       │
│  ┌─────────────┐                                                            │
│  │  Fim        │                                                            │
│  └─────────────┘                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Detalhamento por Etapa

### 1. Receber Evento

**Origem**: Webhook do Chatwoot

**Dados recebidos**:
```json
{
  "event": "message_created",
  "conversation": { ... },
  "message": { ... }
}
```

**Ação**:
- Validar webhook signature
- Extrair dados relevantes
- Criar normalized message

### 2. Normalizar Mensagem

**Processo**:
1. Extrair conversation_id, contact_id, message_id
2. Limpar e formatar conteúdo
3. Detectar idioma (priorizar português)
4. Criar estrutura interna

**Resultado**:
```typescript
interface NormalizedMessage {
  messageId: string;
  chatwootMessageId: number;
  conversationId: string;
  chatwootConversationId: number;
  contactId: string;
  chatwootContactId: number;
  content: string;
  messageType: 'incoming' | 'outgoing';
  senderType: 'user' | 'agent';
  timestamp: Date;
}
```

### 3. Deduplicar

**Mecanismo**:
```
1. Gerar hash: SHA256(conversationId + messageId + content)
2. Verificar no Redis: EXISTS message:hash:{hash}
3. Se existe: RETORNAR (já processado)
4. Se não existe: SET message:hash:{hash}, TTL 1h
5. CONTINUAR processamento
```

### 4. Carregar Contexto

**Fonte**: Redis

**Dados carregados**:
- Estado atual da conversa
- Mensagens anteriores (até 50)
- Variáveis de contexto (pet_id, intent atual, etc.)
- Metadados (started_at, message_count)

**Estrutura no Redis**:
```
conversation:{id}:state → {
  messages: [...],
  context: { ... },
  metadata: { ... }
}
```

### 5. Buscar Memória

**Fonte**: Postgres (tabela customer_memories)

**Query**:
```sql
SELECT * FROM customer_memories 
WHERE contact_id = $1 
AND is_active = true
ORDER BY updated_at DESC;
```

**Resultado**:
- Facts sobre o cliente
- Dados dos pets
- Preferências
- Histórico

### 6. Buscar Conhecimento

**Fonte**: Vector Store (RAG)

**Processo**:
1. Embedding da mensagem do usuário
2. Busca por similaridade
3. Retornar top-k chunks relevantes

**Parâmetros**:
- limit: 5 chunks
- threshold: 0.7 de similaridade

### 7. Chamar LLM + Ferramentas

**Prompt**:
- Sistema: Persona + Instruções
- Contexto: Memória + Conhecimento
- Histórico: Últimas mensagens
- Ferramentas disponíveis

**Processo**:
1. LLM decide se usa ferramentas
2. Se sim, chama ferramenta(s)
3. Ferramentas retornam resultado
4. LLM gera resposta final

**Timeout**: 30 segundos

### 8. Validar Saída

**Validações**:
- ✅ Conteúdo não vazio
- ✅ Nãoviola guardrails
- ✅ Não contém informações sensíveisexpostas
- ✅ Comprimento aceitável (< 5000 chars)
- ✅ Formato markdown válido

**Se inválido**:
- Gerar resposta alternativa
- Se persistir, fazer handoff

### 9. Tratar Erro

**Tipos de erro**:

| Tipo | Ação |
|------|------|
| Timeout LLM | Retentar 1x, depois handoff |
| Erro de ferramenta | Retentar, depois handoff |
| Dados não encontrados | Resposta fallback |
| Erro interno | Log + handoff |

### 10. Responder via Chatwoot

**API**:
```
POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
```

**Body**:
```json
{
  "content": "Resposta do agente..."
}
```

### 11. Resumir Conversa

**Job assíncrono** (worker):
- Acionado após resposta
- Limite: 10 minutos sem nova mensagem
- Gera resumo estruturado
- Salva em conversation_summaries

### 12. Salvar Memória

**Job assíncrono**:
- Extrai facts da conversa
- Calcula confidence
- Salva em customer_memories
- Atualiza memória existente

### 13. Registrar Auditoria

**Job assíncrono**:
- Log de todas as operações
- correlation_id para rastreabilidade
- Níveis: debug, info, warn, error

## Tratamento de Erros

### Erro na Etapa 2-3 (Normalização/Deduplicação)

```
→ Responder erro 400 ao webhook
→ Não reprocessar
→ Log de erro
```

### Erro na Etapa 4-6 (Contexto/Memória/Conhecimento)

```
→ Tentar 2x com backoff
→ Se falhar: continuar sem esses dados
→ Marcar no log
→ Gerar resposta mais cuidadosa
```

### Erro na Etapa 7 (LLM)

```
→ Timeout: tentar 1x
→ Erro de API: tentar 1x
→ Se falhar: handoff automático
→ Mensagem: "Peço desculpas, estamos com dificuldades"
```

### Erro na Etapa 10 (Resposta)

```
→ Tentar 1x
→ Se falhar: handoff para humano
→ Log detalhado
```

### Erro Genérico

```
→ Log do erro completo
→ Tentar handoff
→ Se handoff falhar: responder com mensagem de erro amigável
```

## Estados de Conversa

| Estado | Descrição |
|--------|-----------|
| `new` | Primeira mensagem |
| `in_progress` | Em andamento |
| `waiting` | Aguardando resposta do cliente |
| `handoff` | Transferido para humano |
| `completed` | Resolvido |
| `failed` | Falhou |

## Métricas por Etapa

| Etapa | Métrica | Meta |
|-------|---------|------|
| Deduplicação | Duplicatas detectadas | Monitorar |
| Carregar contexto | Tempo | < 100ms |
| Buscar memória | Tempo | < 200ms |
| Buscar conhecimento | Tempo | < 2s |
| Chamar LLM | Tempo | < 30s |
| Resposta | Tempo total | < 30s |
| Erro | Taxa de erro | < 5% |
