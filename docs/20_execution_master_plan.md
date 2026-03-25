# 20 - Plano Mestre de Execução

## Objetivo

Definir a sequência operacional que reduz risco e prepara o projeto para implementação contínua sem abrir novas frentes antes de fechar os bloqueadores reais.

## Resumo Executivo

| Fase | Status | Leitura Executiva |
|------|--------|-------------------|
| Phase 0 | ✅ Completa | Base técnica estabilizada |
| Phase 1 | ✅ Concluída | CI/CD, testes reproduzíveis, cobertura baseline |
| Phase 2 | ✅ Concluída | Cache embeddings, curadoria, métricas provider, circuit breaker |
| Phase 3 | ✅ Completa | Backbone omnichannel disponível |
| Phase 4 | ✅ Concluída | Analytics, dashboard, eventos, resiliência |
| Phase 5 | ❌ Não iniciada | Deve esperar maturação operacional |

## Sequência Mandatória

### Etapa 1 - Fechamento Operacional

1. ✅ Criar GitHub Actions para `lint`, `typecheck`, `test` e `build`
2. ✅ Ajustar testes para rodarem sem exigir variáveis obrigatórias de produção
3. ✅ Definir baseline de cobertura e publicar resultado no CI

### Etapa 2 - Fechamento de IA Aplicada

1. ✅ Implementar cache de embeddings em Redis
2. ✅ Formalizar fluxo de curadoria do conhecimento
3. ✅ Implementar métricas por provider de IA
4. ✅ Implementar circuit breaker para providers

### Etapa 3 - Fechamento Analítico

1. ✅ Criar eventos de analytics
2. ✅ Publicar dashboard mínimo
3. ✅ Medir resolução automática, handoff, latência e fallback de provider

### Etapa 4 - Expansão Planejada

1. ✅ Revisão de readiness - projeto pronto para produção assistida
2. ❌ Backlog de experimentação (Qdrant, A/B testing) - fora do escopo atual
3. ❌ Preparar backlog enterprise - fora do escopo atual

## Bloqueadores Reais

| Item | Severidade | Impacto |
|------|------------|---------|
| Ausência de GitHub Actions | Alta | Risco de regressão e deploy manual |
| Testes dependentes de env real | Alta | Dificulta validação reprodutível |
| Cache de embeddings ausente | Média | Custo e latência piores |
| Curadoria não formalizada | Média | Baixa governança do conhecimento |
| Analytics operacional ausente | Alta | Fase 4 não fecha e Phase 5 fica cega |

## Decisões de Escopo

### O que sai da rota crítica

- `Qdrant` como bloqueador imediato
- Instagram e Facebook Messenger como critério de conclusão da Phase 3
- Features enterprise antes de CI/CD e analytics

### O que entra na rota crítica

- CI/CD
- Testes reprodutíveis
- Cache de embeddings
- Curadoria básica
- Analytics mínimo

## Critérios de Go/No-Go

### Go para implementar agora

- Correções e evolução incremental nas fases 1, 2 e 4
- Hardening de qualidade
- Instrumentação e governança

### No-Go para abrir agora

- Phase 5
- API pública
- Multi-tenant
- Expansão enterprise

## Plano de 4 Semanas

### Semana 1
- GitHub Actions
- Ajuste de testes para ambiente isolado

### Semana 2
- Cache de embeddings
- Definição do fluxo de curadoria

### Semana 3
- Eventos de analytics
- Dashboard mínimo

### Semana 4
- Revisão de readiness
- Repriorização de `Qdrant` e backlog de inteligência

## Saída Esperada

Ao final deste plano, o projeto deve estar com:

- pipeline mínimo confiável
- documentação alinhada com o código
- backlog de implementação sem contradições
- gates claros antes de qualquer expansão enterprise

*Plano consolidado em 25/03/2026*
