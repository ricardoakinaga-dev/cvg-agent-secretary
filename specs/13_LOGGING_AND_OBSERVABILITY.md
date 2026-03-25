# 13 - Logging e Observabilidade

## Visão Geral

Este documento define os padrões de logging, rastreabilidade e observabilidade do CVG Secretary Agent, essenciais para debugging, auditoria e melhoria contínua.

## Logs Estruturados

### Formato

Todos os logs devem ser JSON estruturado:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Mensagem descritiva",
  "context": {
    "conversationId": "conv-123",
    "contactId": "contact-456",
    "correlationId": "corr-789"
  },
  "metadata": {
    "key": "value"
  }
}
```

### Campos Obrigatórios

| Campo | Tipo | Descrição |
|-------|------|-----------|
| timestamp | ISO 8601 | Data/hora UTC |
| level | string | debug, info, warn, error |
| message | string | Mensagem descritiva |
| context | object | Contexto da operação |

### Campos Opcionais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| correlationId | string | ID de correlação |
| conversationId | string | ID da conversa |
| contactId | string | ID do contato |
| userId | string | ID do usuário (se admin) |
| metadata | object | Dados adicionais |

### Níveis de Log

| Nível | Uso | Exemplo |
|-------|-----|---------|
| debug | Informação detalhada para debugging | "Executando query SQL" |
| info | Informação geral | "Mensagem recebida" |
| warn | Situação inesperada mas não erro | "Retry executado" |
| error | Erro que afeta operação | "Falha ao conectar Redis" |

## Rastreabilidade

### Correlation ID

Todo request deve ter um correlation ID único:

```
1. Receber webhook → Gerar correlation_id (uuid)
2. Incluir em todos os logs da operação
3. Propagar para jobs assíncronos
4. Incluir em todas as chamadas externas
```

**Formato**: `corr-{timestamp}-{random}`

### IDs de Rastreamento

| ID | Escopo | Propagação |
|----|--------|------------|
| correlationId | Request inteiro | Todas as operações |
| conversationId | Conversa | Chatwoot + interno |
| contactId | Cliente | Chatwoot + interno |
| messageId | Mensagem | Chatwoot + interno |
| jobId | Job assíncrono | BullMQ |

## Logs de Ferramentas

### Entrada (Tool Call)

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "debug",
  "message": "Tool call initiated",
  "context": {
    "conversationId": "conv-123",
    "correlationId": "corr-789"
  },
  "metadata": {
    "toolName": "find_contact",
    "toolInput": {
      "phone": "11999999999"
    }
  }
}
```

### Saída (Tool Result)

```json
{
  "timestamp": "2024-01-15T10:30:00.100Z",
  "level": "debug",
  "message": "Tool call completed",
  "context": {
    "conversationId": "conv-123",
    "correlationId": "corr-789"
  },
  "metadata": {
    "toolName": "find_contact",
    "durationMs": 100,
    "status": "success"
  }
}
```

### Erro de Ferramenta

```json
{
  "timestamp": "2024-01-15T10:30:00.100Z",
  "level": "error",
  "message": "Tool call failed",
  "context": {
    "conversationId": "conv-123",
    "correlationId": "corr-789"
  },
  "metadata": {
    "toolName": "create_handoff",
    "durationMs": 5000,
    "status": "error",
    "errorMessage": "Connection timeout"
  }
}
```

## Logs de LLM

### Prompt Enviado

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "debug",
  "message": "LLM request",
  "context": {
    "conversationId": "conv-123",
    "correlationId": "corr-789"
  },
  "metadata": {
    "model": "gpt-4",
    "messagesCount": 10,
    "toolsAvailable": ["find_contact", "save_memory"]
  }
}
```

### Resposta Recebida

```json
{
  "timestamp": "2024-01-15T10:30:00.500Z",
  "level": "debug",
  "message": "LLM response",
  "context": {
    "conversationId": "conv-123",
    "correlationId": "corr-789"
  },
  "metadata": {
    "model": "gpt-4",
    "tokensUsed": 150,
    "toolCalls": [
      {
        "name": "find_contact",
        "arguments": {}
      }
    ]
  }
}
```

## Logs de Erro

### Formato de Erro

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "error",
  "message": "Unhandled error in message processing",
  "context": {
    "conversationId": "conv-123",
    "correlationId": "corr-789"
  },
  "metadata": {
    "errorType": "Error",
    "errorMessage": "Database connection failed",
    "stack": "Error: Database...\n    at...",
    "additionalInfo": {}
  }
}
```

### Boas Práticas

- Sempre incluir stack trace
- Não expor dados sensíveis
- Incluir contexto suficiente para debugging

## Métricas

### Métricas de Sistema

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `agent.messages_received_total` | Counter | Total de mensagens recebidas |
| `agent.messages_processed_total` | Counter | Total processadas com sucesso |
| `agent.messages_failed_total` | Counter | Total que falharam |
| `agent.response_time_seconds` | Histogram | Tempo de resposta |
| `agent.tool_calls_total` | Counter | Total de chamadas de ferramentas |
| `agent.tool_calls_duration_seconds` | Histogram | Tempo de execução de ferramentas |
| `agent.llm_calls_total` | Counter | Total de chamadas ao LLM |
| `agent.llm_tokens_total` | Counter | Tokens gastos |
| `agent.handoffs_total` | Counter | Total de handoffs |
| `agent.errors_total` | Counter | Total de erros |

### Métricas de Negócio

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `agent.conversations_new_total` | Counter | Novas conversas |
| `agent.conversations_resolved_total` | Counter | Conversas resolvidas |
| `agent.conversations_active_gauge` | Gauge | Conversas ativas |
| `agent.resolution_rate` | Gauge | Taxa de resolução |
| `agent.average_messages_per_conversation` | Histogram | Média de mensagens |

### Métricas de Infraestrutura

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `system.cpu_percent` | Gauge | Uso de CPU |
| `system.memory_percent` | Gauge | Uso de memória |
| `database.connections` | Gauge | Conexões Postgres |
| `redis.connected` | Gauge | Conexão Redis |
| `http.request_duration_seconds` | Histogram | Latência HTTP |

## Eventos de Handoff

### Evento de Início

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Handoff initiated",
  "context": {
    "conversationId": "conv-123",
    "correlationId": "corr-789"
  },
  "metadata": {
    "handoffId": "handoff-456",
    "triggerType": "urgency",
    "triggerReason": "Pet in emergency",
    "summary": "Cliente reportou..."
  }
}
```

### Evento de Resolução

```json
{
  "timestamp": "2024-01-15T10:45:00.000Z",
  "level": "info",
  "message": "Handoff resolved",
  "context": {
    "conversationId": "conv-123",
    "correlationId": "corr-789"
  },
  "metadata": {
    "handoffId": "handoff-456",
    "resolutionTimeSeconds": 900,
    "resolvedBy": "agent-789",
    "resolution": "cliente_agendado"
  }
}
```

## Auditoria de Memória

### Memória Salva

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Memory saved",
  "context": {
    "conversationId": "conv-123",
    "correlationId": "corr-789"
  },
  "metadata": {
    "memoryId": "mem-456",
    "contactId": "contact-789",
    "category": "pet_info",
    "key": "pet_nome",
    "confidence": 0.95,
    "source": "extraction"
  }
}
```

### Memória Atualizada

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Memory updated",
  "context": {
    "conversationId": "conv-123",
    "correlationId": "corr-789"
  },
  "metadata": {
    "memoryId": "mem-456",
    "oldValue": "Buddy",
    "newValue": "Max",
    "reason": "Cliente confirmou outro nome"
  }
}
```

## Correlação

### Exemplo de Cadeia de Logs

```
1. [corr-abc123] webhook_received - message_id=111
2. [corr-abc123] message_normalized - conversation_id=conv-1
3. [corr-abc123] context_loaded - messages_count=5
4. [corr-abc123] memory_searched - memories_found=3
5. [corr-abc123] knowledge_searched - chunks_found=2
6. [corr-abc123] llm_request - model=gpt-4
7. [corr-abc123] tool_call - name=find_contact
8. [corr-abc123] tool_result - status=success
9. [corr-abc123] llm_response - tokens=150
10. [corr-abc123] response_sent - message_id=222
11. [corr-abc123] summary_job_queued - job_id=job-1
```

## Monitoramento Operacional

### Dashboards Recomendados

| Dashboard | Conteúdo |
|---------|----------|
| **Overview** | Métricas principais, uptime, taxa de erro |
| **Agent Performance** | Tempo de resposta, handoffs, resoluções |
| **System Health** | CPU, memória, conexões |
| **LLM Usage** | Tokens, custos, latência |
| **Errors** | Erros recentes, stack traces |

### Alertas Recomendados

| Alerta | Condição | Severidade |
|--------|----------|------------|
| Taxa de erro alta | erros > 5% em 5 min | CRITICAL |
| Latência alta | p95 > 30s em 5 min | WARNING |
| Handoffs altos | handoffs > 50% em 10 min | WARNING |
| Memoria Redis | uso > 90% | WARNING |
| Conexões DB | uso > 80% | WARNING |
| API fora | healthcheck falha | CRITICAL |

## Ferramentas Recomendadas

| Função | Ferramenta |
|--------|------------|
| Logs | Datadog, ELK, Loki |
| Métricas | Prometheus + Grafana, Datadog |
| APM | Datadog, New Relic |
| Tracing | Jaeger, Datadog |
| Alerting | PagerDuty, OpsGenie |
