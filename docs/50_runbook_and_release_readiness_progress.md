# 50 - Progresso: Runbook e Readiness de Release

## Data

2026-05-27

## Resumo

Este documento registra a entrega do runbook operacional previsto no plano `docs/42_production_real_readiness_plan.md`.

O plano original exigia:

```text
Runbook producao: Documentar deploy, env vars, rollback e incidentes.
```

## Entregas

### 1. `.env.example`

Foi criado um arquivo seguro de exemplo:

```text
.env.example
```

Ele cobre as variaveis reais usadas por:

- `src/config/index.ts`;
- Chatwoot webhook;
- API auth;
- OpenAI/OpenRouter;
- Qdrant opcional;
- EvolutionAPI opcional;
- Docker Compose.

Isso corrige a divergencia operacional em que o `README.md` instruia copiar `.env.example`, mas o arquivo ainda nao existia.

### 2. Docker Compose atualizado

Arquivo alterado:

```text
docker-compose.yml
```

Atualizacoes:

- removido atributo `version` obsoleto;
- adicionadas variaveis novas:
  - `AI_PROVIDER`
  - `OPENAI_MODEL`
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL`
  - `CHATWOOT_WEBHOOK_SECRET`
  - `API_ADMIN_TOKEN`
  - `QDRANT_URL`
  - `QDRANT_API_KEY`
  - `QDRANT_COLLECTION`

Validacao:

```bash
docker compose --env-file .env.example config
```

Resultado: passou.

### 3. Runbook de producao

Novo documento:

```text
docs/49_production_runbook.md
```

Conteudo:

- variaveis obrigatorias e opcionais;
- pre-release gate;
- deploy com Docker Compose;
- validacao `/health` e `/ready`;
- configuracao Chatwoot;
- validacao pos-deploy;
- API protegida;
- admin de agenda;
- admin de knowledge;
- fluxo real de conversa;
- rollback de imagem;
- rollback funcional rapido;
- incidentes de webhook, API, OpenAI, Chatwoot, agenda, knowledge e Qdrant;
- metricas e auditoria;
- criterio de producao real.

## Validacao Executada

| Comando | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm test -- tests/unit/app-security.test.ts tests/unit/scheduling-admin-routes.test.ts` | passou, 12 testes |
| `docker compose --env-file .env.example config` | passou |

## Impacto no Plano Original

| Item | Estado |
|---|---|
| Runbook producao | Concluido |
| Env vars documentadas | Concluido |
| Rollback documentado | Concluido |
| Incidentes documentados | Concluido |
| Release gate documentado | Concluido |

## Lacunas Restantes

1. Validar Qdrant contra uma instancia real de staging.
2. Validar Chatwoot/EvolutionAPI ponta a ponta em staging real.
3. Elevar cobertura agregada para 80%+.
4. Opcional: automatizar o release gate em CI caso o pipeline oficial ainda nao esteja executando todos os comandos.

## Atualizacao Posterior

Status em 2026-05-27 apos `docs/51_ci_release_gate_progress.md`:

- o CI agora roda `npm audit --omit=dev`;
- o CI agora valida `docker compose --env-file .env.example config`;
- foi adicionado job `release-gate` para resumir os gates em pull requests;
- a sintaxe YAML foi validada localmente;
- `npm audit --omit=dev`, `docker compose --env-file .env.example config`, `npm run lint` e `npm run typecheck` passaram.

Com isso, o item opcional de automatizar o release gate em CI foi concluido como gate basico.
