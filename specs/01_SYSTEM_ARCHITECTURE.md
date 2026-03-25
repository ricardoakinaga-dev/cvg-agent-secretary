# 01 - Arquitetura do Sistema

## Arquitetura Macro do Sistema

O CVG Secretary Agent é composto por múltiplos componentes que trabalham em conjunto para processar mensagens, manter contexto, executar ferramentas e responder aos clientes. A arquitetura segue um padrão event-driven com separação clara entre processamento síncrono (runtime) e operações assíncronas (workers).

### Visão Geral dos Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CVG Secretary Agent                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   Chatwoot   │     │  Telegram    │     │   Monitor    │                │
│  │  (Webhooks)  │     │  (Ingestion) │     │   (Health)   │                │
│  └──────┬───────┘     └──────┬───────┘     └──────────────┘                │
│         │                    │                                               │
│         ▼                    ▼                                               │
│  ┌─────────────────────────────────────────────┐                            │
│  │              API Gateway / Webhook          │                            │
│  │           (Normalização e Deduplicação)      │                            │
│  └──────────────────────┬──────────────────────┘                            │
│                         │                                                    │
│                         ▼                                                    │
│  ┌─────────────────────────────────────────────┐                            │
│  │              Agent Runtime                   │                            │
│  │  ┌─────────────┐ ┌─────────────┐ ┌───────┐ │                            │
│  │  │  Context    │ │   LLM       │ │ Tools │ │                            │
│  │  │  Loader     │ │  (OpenAI)   │ │       │ │                            │
│  │  └─────────────┘ └─────────────┘ └───────┘ │                            │
│  └──────────────────────┬──────────────────────┘                            │
│                         │                                                    │
│         ┌───────────────┼───────────────┐                                   │
│         ▼               ▼               ▼                                   │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐                              │
│  │  Redis    │   │ Postgres  │   │  Vector   │                              │
│  │ (State)   │   │   (Data)  │   │   Store   │                              │
│  └───────────┘   └───────────┘   │  (RAG)    │                              │
│                                  └───────────┘                              │
│                                                                              │
│  ┌─────────────────────────────────────────────┐                            │
│  │              Workers (Assíncronos)           │                            │
│  │  ┌─────────────┐ ┌─────────────┐ ┌───────┐ │                            │
│  │  │  Memory     │ │  Knowledge  │ │Tele-  │ │                            │
│  │  │  Worker     │ │  Ingestion  │ │gram   │ │                            │
│  │  └─────────────┘ └─────────────┘ └───────┘ │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Fluxo de Processamento Principal

### Fluxo Síncrono (Chatwoot → Runtime → Chatwoot)

1. **Recebimento**: Chatwoot envia webhook com nova mensagem
2. **Normalização**: API converte mensagem para formato interno padronizado
3. **Deduplicação**: Redis impede processamento de mensagens duplicadas
4. **Carregamento de Contexto**: Runtime carrega estado da conversa do Redis
5. **Busca de Memória**: Sistema busca histórico relevante do Postgres
6. **Busca de Conhecimento**: RAG retorna documentos relevantes
7. **Execução do Agente**: LLM gera resposta com ferramentas disponíveis
8. **Execução de Ferramentas**: Ferramentas são chamadas conforme necessidade
9. **Validação de Saída**: Sistema valida resposta antes do envio
10. **Resposta**: Mensagem enviada de volta via Chatwoot API
11. **Persistência**: Memória e logs salvos de forma assíncrona

### Fluxo Assíncrono

- **Resumo de Conversa**: Após conversa encerramento, worker gera resumo
- **Salvamento de Memória**: Facts extraídos são persistidos
- **Ingestão de Conhecimento**: Documentos do Telegram são processados
- **Auditoria**: Logs de execução são agregados e armazenados

## Papéis dos Componentes

### Redis

O Redis atua como camada de estado transiente e filas:

| Função | Descrição |
|--------|-----------|
| **Estado de Conversa** | Armazena contexto atual da conversa (últimas N mensagens, variáveis de estado) |
| **Deduplicação** | Bloom filter ou keys temporárias para evitar processamento duplicado |
| **Filas de Trabalho** | Filas BullMQ para jobs assíncronos (resumo, memória, ingestion) |
| **Cache** | Cache de热点 dados do Postgres (conversas ativas, dados de contato) |
| **Rate Limiting** | Controle de taxa por conversa e por contact |

**Estrutura de Keys Sugeridas**:

```
conversation:{conversationId}:state     # Hash com estado atual
conversation:{conversationId}:messages  # Lista de mensagens recentes
contact:{contactId}:context             # Contexto carregado do contact
job:queue:{name}:{jobId}                # Status de jobs
lock:tool:{toolName}:{resourceId}       # Lock para execução de ferramentas
```

### Postgres

O Postgres é o banco de dados relacional principal:

| Função | Descrição |
|--------|-----------|
| **Dados Estruturados** | Contacts, pets, conversations, mensagens |
| **Memória Persistente** | Facts extraídos, resumos, histórico |
| **Catálogo de Serviços** | Serviços oferecidos, preços, duração |
| **Regras Operacionais** | Políticas, horários, procedimentos |
| **Auditoria** | Logs de auditoria, execuções de ferramentas |

**Decisões Arquiteturais**:
- Tabelas normalizadas até 3NF para dados transacionais
- JSONB para dados semiestruturados (memória, contexto)
- indexes em colunas de filtro frequente (contact_id, conversation_id, created_at)
- Particionamento por data para logs de auditoria (se necessário)

### Vector Store (RAG)

O Vector Store armazena conhecimento semântico:

| Função | Descrição |
|--------|-----------|
| **Base de Conhecimento** | FAQ, políticas, procedimentos, horários |
| **Documentos Internos** | Manuais, protocolos, documentos de treinamento |
| **Busca Semântica** | Recuperação de informação por similaridade |

**Tecnologias Sugeridas**:
- Pinecone (gerenciado)
- Qdrant (self-hosted)
- pgvector (no Postgres)

**Configuração de Embeddings**:
- Modelo: text-embedding-3-small (OpenAI)
- Dimensão: 1536
- Normalização: L2

### Telegram (Ingestão)

O Telegram funciona como canal administrativo interno:

| Função | Descrição |
|--------|-----------|
| **Atualização de Conhecimento** | Envio de documentos para base RAG |
| **Comandos Administrativos** | Controle do sistema, status, reload |
| **Feedback** | Aprovação de conteúdo ingested |

**Arquitetura de Bot**:
- Bot Telegram dedicado para ingestion
- Canais privados para cada tipo de conteúdo
- Sistema de aprovação para novos documentos

### Chatwoot

O Chatwoot é o canal de atendimento ao cliente:

| Função | Descrição |
|--------|-----------|
| **Recebimento de Mensagens** | Webhooks de novas mensagens |
| **Envio de Respostas** | API para envio de mensagens |
| **Gestão de Conversas** | Labels, status, atribuição |
| **Notas Internas** | Información contextual para atendentes |

## Separação entre Componentes

### Runtime (API Principal)

Responsabilidades:
- Receber webhooks do Chatwoot
- Orquestrar execução do agente
- Chamar LLM e ferramentas
- Validar e enviar respostas
- Gerenciar estado de conversa no Redis

Características:
- Processamento síncrono
- Baixa latência (< 30s)
- Escalabilidade horizontal
- Stateless (estado no Redis)

### Workers (Assíncronos)

Responsabilidades:
- Processar jobs de longa duração
- Gerar resumos de conversas
- Ingerir documentos do Telegram
- Processar memórias em background

Características:
- Processamento assíncrono
- Filas Redis/BullMQ
- Retry automático
- Backoff exponencial

### Ingestão Telegram

Responsabilidades:
- Receber documentos via Telegram
- Classificar e validar conteúdo
- Enviar para processamento RAG ou Postgres
- Notificar aprovação quando necessário

### Observabilidade

Responsabilidades:
- Agregar logs estruturados
- Métricas de performance
-health checks
- Alertas

## Fluxos Síncronos vs Assíncronos

### Síncrono (Tempo Real)

| Etapa |_TIMEOUT_ | Responsabilidade |
|-------|-----------|------------------|
| Receber webhook | 5s | API Gateway |
| Normalizar mensagem | 2s | Runtime |
| Deduplicar | 1s | Redis |
| Carregar contexto | 3s | Runtime |
| Buscar memória | 5s | Postgres |
| Buscar conhecimento | 10s | Vector Store |
| Chamar LLM | 30s | OpenAI |
| Executar ferramentas | 15s | Runtime |
| Responder | 5s | Chatwoot API |

**Timeout total**: ~76 segundos (com margem)

### Assíncrono (Background)

| Job | Fila | Prioridade | Tempo Est. |
|-----|------|------------|------------|
| Resumir conversa | memory | low | 30s - 5m |
| Salvar memória | memory | medium | 10s - 2m |
| Ingerir documento | knowledge | low | 1m - 10m |
| Limpar cache | system | low | 5s |

## Decisões Arquiteturais

### 1. Stateless Runtime

O runtime não mantém estado entre requisições. Todo contexto é carregado do Redis a cada requisição. Isso permite:
- Escalabilidade horizontal simples
- Tolerância a falhas (qualquer instância pode processar)
- Deploy rolling sem downtime

### 2. Separação de Read/Write

- **Leitura**: Runtime faz reads para contexto
- **Escrita**: Workers fazem writes de forma assíncrona
- **Razão**: Evita locks, melhora latência de resposta

### 3. Eventual Consistency

- Memórias e resumos são salvos de forma assíncrona
- Pode haver pequeno delay até aparecerem na próxima consulta
- tradeoff aceito por latência acceptable

### 4. Circuit Breaker

Todas as integrações externas (OpenAI, Chatwoot, Postgres, Redis) devem ter circuit breaker:
- Após N falhas consecutivas, abrir circuito
- Durante aberto, retornar fallback rápido
- Após timeout, tentar novamente (half-open)

### 5. Retry com Backoff

Jobs que falham devem ter retry automático:
- 3 tentativas imediatas
- Backoff exponencial (1s, 2s, 4s)
- Max 3 retries por job
- DLQ (Dead Letter Queue) para jobs definitivamente falhados
