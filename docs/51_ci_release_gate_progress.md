# 51 - Progresso: CI Release Gate

## Data

2026-05-27

## Resumo

Este documento registra o alinhamento do CI com o release gate descrito no runbook `docs/49_production_runbook.md` e no plano `docs/42_production_real_readiness_plan.md`.

O workflow existente ja rodava:

- lint;
- typecheck;
- coverage;
- build;
- Docker build.

Faltavam dois gates relevantes para producao:

- auditoria de dependencias de producao;
- validacao do Docker Compose com `.env.example`.

## Entregas

Arquivo alterado:

```text
.github/workflows/ci.yml
```

Novos passos no job principal:

```text
npm audit --omit=dev
docker compose --env-file .env.example config
```

Tambem foi adicionado um job `release-gate` para resumir os checks obrigatorios em pull requests depois de `build` e `docker` passarem.

## Gates Cobertos no CI

| Gate | Status |
|---|---|
| `npm run lint` | coberto |
| `npm run typecheck` | coberto |
| `npm run test:coverage` | coberto |
| `npm run build` | coberto |
| `npm audit --omit=dev` | coberto |
| `docker compose --env-file .env.example config` | coberto |
| Docker build | coberto |

## Validacao Local Executada

| Comando | Resultado |
|---|---|
| Parse YAML do `.github/workflows/ci.yml` | passou |
| `npm audit --omit=dev` | passou, 0 vulnerabilidades |
| `docker compose --env-file .env.example config` | passou |
| `npm run lint` | passou |
| `npm run typecheck` | passou |

## Impacto no Plano Original

| Item | Estado |
|---|---|
| Release gate | Mais completo e automatizado no CI |
| Docker e CI verdes | Workflow cobre Docker build e compose config |
| Vulnerabilidades | Audit de producao agora entra no CI |
| Runbook | CI agora reflete o gate documentado |

## Lacunas Restantes

1. Validar Qdrant contra uma instancia real de staging.
2. Validar Chatwoot/EvolutionAPI ponta a ponta em staging real.
3. Elevar cobertura agregada para 80%+.
4. Opcional: adicionar publicacao de imagem e deploy automatizado quando houver registry/ambiente definidos.

## Atualizacao Posterior

Status em 2026-05-27 apos `docs/52_knowledge_health_observability_progress.md`:

- `/health` agora reporta a dependencia `knowledge`;
- falha de retrieval/RAG deixa o health como `degraded`;
- foram adicionados testes HTTP para knowledge conectado e knowledge em erro;
- `npm test`, `npm run test:coverage`, `npm run build`, `npm audit --omit=dev` e Docker passaram.
