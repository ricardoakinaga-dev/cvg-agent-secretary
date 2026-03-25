# 09 - Testes e Qualidade

## Objetivo

Registrar o estado real de qualidade do projeto e os gaps que ainda impedem um fluxo de implementação seguro.

## Estado Atual

### Implementado

- Vitest configurado
- Testes unitários presentes em múltiplos módulos
- Script `npm test`
- Script `npm run test:coverage`
- `typecheck` e `build`

### Gap crítico atual

A suíte não é totalmente reproduzível em ambiente limpo: a execução atual de `npm test` falha sem variáveis obrigatórias como `DATABASE_URL`. Isso torna a etapa de qualidade incompleta até que os testes sejam isolados do bootstrap de produção.

## Inventário Atual de Testes

Arquivos identificados em `tests/`:

- `tests/chatwoot/normalizer.test.ts`
- `tests/handoff/summary.test.ts`
- `tests/intent/classifier.test.ts`
- `tests/knowledge/retrieval.test.ts`
- `tests/knowledge/tools.test.ts`
- `tests/memory/tools.test.ts`
- `tests/security/guardrails.test.ts`
- `tests/telegram-ingestion/classifier.test.ts`
- `tests/unit/intent-classifier.test.ts`
- `tests/unit/metrics.test.ts`
- `tests/unit/validation.test.ts`

## Diagnóstico

| Item | Status |
|------|--------|
| Framework de testes | ✅ |
| Testes existentes | ✅ |
| Execução determinística em ambiente limpo | ❌ |
| Cobertura auditada no CI | ❌ |
| Integração com pipeline CI | ❌ |

## Roadmap de Qualidade

### Prioridade imediata

1. Remover dependência de env real na inicialização dos testes
2. Padronizar setup de testes
3. Publicar cobertura em CI

### Prioridade seguinte

1. Expandir cobertura de `knowledge`, `runtime` e `ai/router`
2. Adicionar testes de integração críticos
3. Definir threshold mínimo de cobertura

## Critério de conclusão da frente de qualidade

- `npm test` roda em ambiente limpo
- CI executa testes automaticamente
- Cobertura mínima formalizada

*Documento revisado em 25/03/2026*
