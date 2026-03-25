# 12 - Arquitetura de Deploy

## Visão Geral

Este documento detalha a arquitetura de deployment do CVG Secretary Agent, incluindo serviços, ambientes e dependências.

## Visão de Deploy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ARQUITETURA DE DEPLOY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         CLOUD PROVIDER                               │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │                    KUBERNETES / DOCKER                        │  │   │
│  │  │                                                                │  │   │
│  │  │  ┌────────────┐   ┌────────────┐   ┌────────────┐          │  │   │
│  │  │  │   API      │   │   Worker   │   │  Telegram  │          │  │   │
│  │  │  │   (Node)   │   │  (Node)    │   │  Ingest    │          │  │   │
│  │  │  │            │   │            │   │  (Node)    │          │  │   │
│  │  │  │   x2+      │   │   x2+      │   │   x1       │          │  │   │
│  │  │  └────────────┘   └────────────┘   └────────────┘          │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                              │                                       │   │
│  │                              ▼                                       │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │                    INFRAESTRUTURA GERENCIADA                  │  │   │
│  │  │                                                                │  │   │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │  │   │
│  │  │  │  Redis   │  │ Postgres │  │ Vector   │  │  S3/     │   │  │   │
│  │  │  │ (ElastiCache)│ (RDS)   │  │ Store    │  │  Files   │   │  │   │
│  │  │  │           │  │          │  │(Pinecone)│  │          │   │  │   │
│  │  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        SERVIÇOS EXTERNOS                            │   │
│  │                                                                        │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   │  Chatwoot    │  │   OpenAI      │  │   Telegram   │           │
│  │   │  (Cloud)     │  │   (API)       │  │   (Bot API)  │           │
│  │   └──────────────┘  └──────────────┘  └──────────────┘           │
│  │                                                                        │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Serviços do Sistema

### API Principal (Runtime)

| Aspecto | Detalhe |
|---------|---------|
| **Tecnologia** | Node.js + TypeScript |
| **Framework** | Express ou Fastify |
| **Instâncias** | 2+ (escalável) |
| **Recursos** | 1 vCPU, 1GB RAM |
| **Porta** | 3000 |
| **Responsabilidade** | Receber webhooks, processar agente |

### Worker

| Aspecto | Detalhe |
|---------|---------|
| **Tecnologia** | Node.js + TypeScript |
| **Framework** | BullMQ (filas) |
| **Instâncias** | 2+ |
| **Recursos** | 1 vCPU, 1GB RAM |
| **Responsabilidade** | Jobs assíncronos |

### Telegram Ingestion

| Aspecto | Detalhe |
|---------|---------|
| **Tecnologia** | Node.js + TypeScript |
| **Instâncias** | 1 (pode ter réplicas) |
| **Recursos** | 0.5 vCPU, 512MB RAM |
| **Responsabilidade** | Webhook do Telegram, processar conteúdo |

### Observabilidade

| Aspecto | Detalhe |
|---------|---------|
| **Tecnologia** | Prometheus + Grafana ou DataDog |
| **Instâncias** | 1 (gerenciado) |
| **Responsabilidade** | Métricas e logs |

## Serviços de Infraestrutura

### Redis

| Aspecto | Detalhe |
|---------|---------|
| **Provedor** | AWS ElastiCache / Upstash |
| **Tipo** | Redis 7.x |
| **Cluster** | Single node (MVP) ou Cluster |
| **Modo** | Cluster mode desativado |
| **Porta** | 6379 |
| **Password** | Sim |
| **TTL** | keys com TTL automático |
| **Usado para** | Estado, cache, filas |

### Postgres

| Aspecto | Detalhe |
|---------|---------|
| **Provedor** | AWS RDS / Supabase |
| **Tipo** | PostgreSQL 15+ |
| **Instância** | db.t3.micro (MVP) |
| **Storage** | 20GB SSD |
| **Backup** | Daily automated |
| **Usado para** | Dados, memória, auditoria |

### Vector Store

| Aspecto | Detalhe |
|---------|---------|
| **Provedor** | Pinecone / Qdrant Cloud |
| **Dimensão** | 1536 (text-embedding-3-small) |
| **Metadados** | Enabled |
| **Usado para** | RAG |

### Armazenamento de Arquivos

| Aspecto | Detalhe |
|---------|---------|
| **Provedor** | AWS S3 / MinIO |
| **Bucket** | cvg-agent-documents |
| **Usado para** | Documentos, imagens |

## Ambientes

### Desenvolvimento Local

| Componente | Configuração |
|------------|--------------|
| API | localhost:3000 |
| Redis | localhost:6379 |
| Postgres | localhost:5432 |
| Vector Store |pinecone local ou stub |
| Chatwoot | Sandbox ou local |
| Telegram | Bot em modo desenvolvimento |

### Staging

| Componente | Configuração |
|------------|--------------|
| API | k8s staging |
| Redis | Managed staging |
| Postgres | Managed staging |
| Vector Store | Namespace staging |
| Chatwoot | Instância staging |
| Telegram | Bot de staging |

### Produção

| Componente | Configuração |
|------------|--------------|
| API | k8s production (2+ réplicas) |
| Redis | ElastiCache production |
| Postgres | RDS production |
| Vector Store | Namespace production |
| Chatwoot | Instância production |
| Telegram | Bot de produção |

## Variáveis de Ambiente

### Required

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `NODE_ENV` | Ambiente | production |
| `PORT` | Porta da API | 3000 |
| `DATABASE_URL` | Connection Postgres | postgres://... |
| `REDIS_URL` | Connection Redis | redis://... |
| `OPENAI_API_KEY` | Chave OpenAI | sk-... |
| `CHATWOOT_API_URL` | URL Chatwoot | https://app.chatwoot.com |
| `CHATWOOT_API_TOKEN` | Token Chatwoot | ... |
| `CHATWOOT_ACCOUNT_ID` | Account ID | 1 |
| `TELEGRAM_BOT_TOKEN` | Token do Bot | ... |
| `VECTOR_STORE_API_KEY` | Chave Pinecone | ... |
| `VECTOR_STORE_ENVIRONMENT` | Ambiente Pinecone | us-east-1 |

### Optional

| Variável | Descrição | Padrão |
|----------|-----------|---------|
| `LOG_LEVEL` | Nível de log | info |
| `METRICS_ENABLED` | Métricas | true |
| `REDIS_PASSWORD` | Password Redis | - |
| `JWT_SECRET` | Secret JWT | - |
| `RATE_LIMIT_WINDOW` | Janela rate limit | 60000 |
| `RATE_LIMIT_MAX` | Máximo requests | 100 |

## Dependências entre Serviços

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Chatwoot  │────>│     API     │────>│   Redis     │
│   (Webhook) │     │  (Runtime)  │     │  (Estado)   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ├─────────────┐
                           │             │
                           ▼             ▼
                     ┌──────────┐  ┌──────────┐
                     │ Postgres │  │  Vector  │
                     │  (Dados) │  │  Store   │
                     └──────────┘  └──────────┘
                           │
                           ▼
                     ┌──────────┐
                     │  Worker  │
                     │ (Async)  │
                     └──────────┘

┌─────────────┐     ┌─────────────┐
│  Telegram   │────>│   Ingest    │────>│ Postgres │
│   (Admin)   │     │   Worker    │     │  Vector  │
└─────────────┘     └─────────────┘     └──────────┘
```

## Healthchecks

### Endpoint de Health

```
GET /health
```

Resposta:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "dependencies": {
    "redis": "connected",
    "postgres": "connected",
    "vector_store": "connected",
    "chatwoot": "connected"
  },
  "version": "1.0.0"
}
```

### Verificações

| Serviço | Verificação | Timeout |
|---------|-------------|---------|
| Redis | PING | 1s |
| Postgres | SELECT 1 | 2s |
| Vector Store | Index exists | 5s |
| Chatwoot | API health | 5s |

### Readiness vs Liveness

| Probe | Propósito | Falha |
|-------|-----------|-------|
| Readiness | Pronto para receber | Remove do load balancer |
| Liveness | Está vivo | Reinicia pod |

## Estratégia de Deploy

### Rolling Update

1. Nova versão do docker image
2. Kubernetes faz rolling update
3. Healthcheck valida nova versão
4. Traffic muda gradualmente

### Estratégia de Rollback

1. Detectar problema (healthcheck ou métrica)
2. Rollback para imagem anterior
3. Verificar se problema resuelto
4. Se não, investigar logs

### Zero Downtime

- Múltiplas réplicas
- Healthcheck antes de traffic
- Graceful shutdown (term signal)
- Drain connections antes de parar
