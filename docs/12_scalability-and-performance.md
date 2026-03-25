# 12 - Escalabilidade e Performance

## Objetivo

Mapear os mecanismos já implementados e os próximos ganhos reais de performance.

## Estado Atual

### Implementado

- Pool de conexões PostgreSQL
- Redis para estado e deduplicação
- Rate limiting
- Camada de normalização de canais

### Pendente

- Cache de embeddings
- Circuit breaker
- Índices e tuning guiados por métricas
- observabilidade de performance consolidada

## Prioridades Reais

| Prioridade | Item | Motivo |
|------------|------|--------|
| Alta | Cache de embeddings | Reduz custo e latência de IA |
| Alta | Métricas de performance por fluxo | Evita otimização às cegas |
| Média | Circuit breaker | Aumenta resiliência |
| Média | Revisão de índices | Deve ser guiada por carga real |

## Decisão de Roadmap

`Qdrant` não é melhoria de performance prioritária enquanto o cache de embeddings e a telemetria básica seguirem pendentes.

*Documento revisado em 25/03/2026*
