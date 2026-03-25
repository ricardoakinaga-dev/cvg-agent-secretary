# 10 - Observabilidade

## Objective

Estabelecer um sistema completo de observabilidade para o CVG Agent Secretary, permitindo monitoramento, alertas, e diagnóstico de problemas em produção.

## Scope

### In Scope
- Logging estruturado
- Métricas de aplicação
- Health checks
- Tracing (correlation IDs)
- Dashboards

### Out of Scope
- APM externo (DataDog, New Relic)
- Logs centralizados (ELK, Loki)
- Alertas PagerDuty

## Sistema de Logging Atual

### Implementação
```typescript
// src/modules/logging/index.ts
class Logger {
  private logger: Pino;

  constructor() {
    this.logger = pino({
      level: config.logging.level,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
        },
      },
    });
  }

  error(message: string, error: Error, context?: Record<string, unknown>): void {
    this.logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...context,
    }, message);
  }
}

export const logger = new Logger();
```

### Correlation ID
```typescript
// src/app.ts
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || uuidv4();
  next();
});
```

## Detailed Tasks

### 10.1 - Health Checks

#### Implementação Atual
```typescript
// src/app.ts
async function getHealthStatus(): Promise<HealthStatus> {
  const dependencies = {
    redis: 'disconnected',
    postgres: 'disconnected',
    chatwoot: 'disconnected',
    openai: 'disconnected',
  };

  // Check Redis
  const redisHealthy = await redisClient.ping();
  dependencies.redis = redisHealthy ? 'connected' : 'error';

  // Check ChatWoot
  const chatwootHealthy = await chatwootClient.healthCheck();
  dependencies.chatwoot = chatwootHealthy ? 'connected' : 'error';

  // Check OpenAI
  const openaiHealthy = await openaiClient.healthCheck();
  dependencies.openai = openaiHealthy ? 'connected' : 'error';

  return {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    dependencies,
  };
}
```

#### Endpoints
| Endpoint | Uso |
|----------|-----|
| GET /health | Health check completo |
| GET /ready | Verificação de prontidão |

### 10.2 - Métricas de Aplicação

#### Métricas a Implementar
```typescript
// src/shared/metrics.ts
interface ApplicationMetrics {
  // Runtime
  request_count: Counter;
  request_duration: Histogram;
  active_connections: Gauge;

  // Business
  messages_processed: Counter;
  handoffs_total: Counter;
  knowledge_queries: Counter;
  llm_calls: Counter;
  llm_errors: Counter;

  // Dependencies
  redis_latency: Histogram;
  postgres_latency: Histogram;
  chatwoot_latency: Histogram;
  openai_latency: Histogram;
}
```

### 10.3 - Tracing

#### Padrões de Tracing
- Correlation ID em todas as requisições
- Logging de entrada/saída de funções críticas
- Trace de exceções

### 10.4 - Dashboards

#### Métricas para Dashboard
| Gráfico | Tipo | Fonte |
|----------|------|-------|
| Request Rate | Line | Métricas |
| Error Rate | Line | Métricas |
| Latency P95 | Line | Métricas |
| Dependency Health | Status | Health |
| Conversation Volume | Bar | DB |
| Handoff Rate | Pie | DB |

## Affected Files

- `src/modules/logging/index.ts` - Logger
- `src/app.ts` - Health checks
- `src/shared/metrics.ts` - (a criar)

## Validation Checkpoints

- [x] Logging estruturado implementado
- [x] Correlation IDs implementados
- [x] Health checks implementados
- [ ] Métricas Prometheus (Fase 1)
- [ ] Dashboards (Fase 1)
- [ ] Alertas (Fase 2)

## Stack Recomendada

| Componente | Ferramenta | Fase |
|------------|------------|------|
| Logs | Pino | ✅ |
| Metrics | Prometheus | Fase 1 |
| Tracing | OpenTelemetry | Fase 2 |
| Dashboard | Grafana | Fase 1 |
| Alerts | AlertManager | Fase 2 |
