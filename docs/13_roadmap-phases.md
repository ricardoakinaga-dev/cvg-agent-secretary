# 13 - Roadmap de Fases

## Objetivo

Consolidar o roadmap real do CVG Agent Secretary com base no código existente, nos relatórios de progresso e na auditoria documental de 25/03/2026. Este documento substitui o roadmap puramente aspiracional e passa a ser a referência para entrada na fase de implementação.

## Estado Atual Consolidado

| Fase | Nome | Status | Situação Real |
|------|------|--------|---------------|
| Phase 0 | Estabilização | ✅ Completa | Build e tipagem regularizados |
| Phase 1 | Fortalecimento | ⚠️ Parcial | Testes, validação, rate limit e métricas existem; CI/CD ainda não |
| Phase 2 | Evolução de IA | ⚠️ Parcial | AI router e OpenRouter implementados; Qdrant, cache e curadoria pendentes |
| Phase 3 | Omnicanal | ✅ Completa | Normalização multicanal e WhatsApp via Evolution API implementados |
| Phase 4 | Inteligência | ⚠️ Parcial | Enhanced RAG e learning loop implementados; analytics e experimentação pendentes |
| Phase 5 | Escala Enterprise | ❌ Não iniciada | Backlog estratégico, sem implementação atual |

## Ordem Recomendada de Execução

1. Fechar os pendentes de Phase 1
2. Fechar os pendentes críticos de Phase 2
3. Fechar o baseline analítico mínimo de Phase 4
4. Só então abrir a frente de Phase 5

## Dependências Reais

```
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5
              |          |                     |
              |          |                     +-> depende de analytics mínimo
              |          +-> depende de cache/curadoria para maturidade de IA
              +-> depende de CI/CD para reduzir risco operacional
```

### Dependências Críticas

| Dependência | Motivo |
|------------|--------|
| Phase 1 -> continuidade de implementação | Sem CI/CD, cada avanço aumenta risco de regressão e deploy manual |
| Phase 2 -> maturidade de RAG | Sem cache e curadoria, custo e governança do conhecimento continuam frágeis |
| Phase 4 -> Phase 5 | Features enterprise exigem observabilidade e indicadores confiáveis |

## Escopo Revisado por Fase

### Phase 0: Estabilização

**Status:** ✅ Completa

**Entregas concluídas**
- Correções críticas no classificador
- TypeScript sem erros
- Ajustes de tipagem e parsing de configuração

**Critério de saída**
- `npm run build` passa
- Baseline técnica estável

---

### Phase 1: Fortalecimento

**Status:** ✅ Concluída

**Concluído**
- Validação com Zod
- Rate limiting
- Métricas internas
- Suite de testes existente
- Docker e `docker-compose.yml`
- GitHub Actions CI (`.github/workflows/ci.yml`)
- Testes executáveis sem dependências de ambiente real (setup file)
- Meta de cobertura definida em vitest.config.ts

**Gate para conclusão**
- Pipeline CI executando `lint`, `typecheck`, `test` e `build`
- Testes rodando em ambiente de CI sem depender de secrets reais

---

### Phase 2: Evolução de IA

**Status:** ✅ Concluída

**Concluído**
- Interface de providers
- OpenAI + OpenRouter
- AI router com fallback
- Cache de embeddings em Redis
- Curadoria de conhecimento com workflow de publicação

**Gate para conclusão**
- Cache de embeddings ativo e instrumentado
- Métricas por provider disponíveis
- Retrieval respeita apenas documentos publicados

---

### Phase 3: Omnicanal

**Status:** ✅ Completa

**Concluído**
- Camada de normalização de canais
- WhatsApp via Evolution API
- Integração com Telegram no contexto de ingestion

**Ajuste de escopo**
- Instagram e Facebook Messenger deixam de ser critério de conclusão desta fase
- Fase passa a ser considerada concluída pelo backbone omnichannel já entregue

---

### Phase 4: Inteligência

**Status:** ✅ Concluída

**Concluído**
- Enhanced RAG
- Learning loop
- Cache de embeddings em Redis
- Curadoria de conhecimento com workflow de publicação
- Modelo de eventos analíticos
- Dashboard operacional mínimo (`GET /api/analytics/dashboard`)

**Gate para conclusão**
- Dashboard mínimo com volume, handoff, resolução e latência ✅
- Base de eventos confiável para futuras automações ✅

---

### Phase 5: Escala Enterprise

**Status:** ❌ Não iniciada

**Escopo mantido**
- Multi-tenant
- RBAC
- Audit logs
- API pública
- Webhooks
- SLAs

**Pré-requisitos de entrada**
- CI/CD ativo
- Analytics mínimo operacional
- Governança de conhecimento minimamente fechada

## Priorização Executiva

### Must Have
1. CI/CD com GitHub Actions
2. Testes executáveis sem dependências de ambiente real
3. Cache de embeddings
4. Dashboard analítico mínimo

### Should Have
1. Curadoria de conhecimento
2. Meta formal de cobertura
3. Instrumentação de eventos analíticos

### Could Have
1. Qdrant
2. Detecção de padrões
3. A/B testing

### Won't Have no ciclo atual
1. Multi-tenant
2. API pública
3. Webhooks para terceiros

## Go/No-Go para Implementação

**Status:** ⚠️ GO controlado

Podemos seguir para implementação incremental, mas não para uma fase de expansão livre. O roadmap revisado recomenda:

1. Fechar CI/CD primeiro
2. Garantir testes reproduzíveis
3. Priorizar cache e analytics mínimo
4. Manter Phase 5 fora do escopo imediato

## Revisão

- Última revisão consolidada: 25/03/2026
- Fonte de verdade complementar: `20_execution_master_plan.md`
