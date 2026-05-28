# 52 - Progresso: Health de Knowledge e Qdrant

## Data

2026-05-27

## Resumo

Este documento registra melhoria de observabilidade para a camada de conhecimento/RAG.

O adapter Qdrant e o fallback PostgreSQL ja existiam, mas `/health` ainda nao expunha se a camada de retrieval estava saudavel. Isso deixava uma lacuna operacional: o sistema poderia estar com Redis, Postgres, Chatwoot e OpenAI saudaveis, mas com retrieval degradado sem sinal direto no health check.

## Entregas

### 1. Nova dependencia no health check

`DependencyStatus` agora inclui:

```text
knowledge
```

Valores possiveis:

```text
connected | disconnected | error
```

Arquivos:

```text
src/shared/types.ts
src/app.ts
```

### 2. `/health` consulta o retrieval service

`GET /health` agora chama:

```text
knowledgeRetrievalService.healthCheck()
```

Comportamento:

- se o backend ativo de retrieval estiver saudavel, `knowledge: connected`;
- se falhar, `knowledge: error`;
- se falhar, o status geral fica `degraded`.

Observacao: Qdrant continua opcional. Quando Qdrant nao esta configurado, o health usa a saude do fallback PostgreSQL full-text. Quando Qdrant esta ativo, o health do adapter Qdrant passa a representar a camada vetorial.

### 3. Readiness permanece focado em dependencias criticas

`GET /ready` continua validando:

- Redis;
- Postgres;
- Chatwoot.

Motivo: o runtime ja trata falhas de knowledge de forma degradavel. Retrieval ruim deve acionar alerta operacional, mas nao necessariamente impedir o servico de receber trafego se handoff/fallback estiver funcionando.

## Testes

Arquivo alterado:

```text
tests/unit/app-security.test.ts
```

Novos cenarios:

- `/health` reporta `knowledge: connected`;
- `/health` retorna `503` e `status: degraded` quando knowledge falha.

Tambem foi ajustado:

```text
tests/unit/scheduling-admin-routes.test.ts
```

para mockar `knowledgeRetrievalService` e manter testes HTTP isolados.

## Validacao Executada

| Comando | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm test` | passou, 168 testes em 21 suites |
| `npm run test:coverage` | passou |
| `npm run build` | passou |
| `npm audit --omit=dev` | passou, 0 vulnerabilidades |
| `docker build -t cvg-secretary-agent:codex-check .` | passou |

Cobertura atual:

| Metrica | Valor |
|---|---:|
| Statements | 68.48% |
| Branches | 57.40% |
| Functions | 70.81% |
| Lines | 68.98% |

## Impacto no Plano Original

| Item | Estado |
|---|---|
| Observabilidade de knowledge | Melhorada |
| Qdrant opcional | Mais operavel, pois aparece indiretamente no health do retrieval |
| Readiness final | Mais proximo de producao assistida robusta |

## Lacunas Restantes

1. Validar Qdrant contra uma instancia real de staging.
2. Validar Chatwoot/EvolutionAPI ponta a ponta em staging real.
3. Elevar cobertura agregada para 80%+.
