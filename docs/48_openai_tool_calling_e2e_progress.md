# 48 - Progresso: E2E Unitario de Agenda via Tool Calling

## Data

2026-05-27

## Resumo

Este documento registra a validacao do fluxo de agenda com tool calling no provedor OpenAI.

O objetivo era cobrir uma lacuna do plano `docs/42_production_real_readiness_plan.md`:

```text
E2E agenda: testar consulta e confirmacao de horario, garantindo que confirmacao so ocorre via tool.
```

## Entregas

### 1. Classe OpenAI testavel

`OpenAIClient` agora e exportada para permitir teste isolado do fluxo de tool calling sem chamar a API externa.

Arquivo:

```text
src/modules/openai/client.ts
```

### 2. E2E unitario de tool calling

Novo teste:

```text
tests/unit/openai-tool-calling.test.ts
```

O teste simula respostas do modelo com `tool_calls` e valida que o client:

1. envia ferramentas ao OpenAI;
2. executa `check_available_slots`;
3. injeta o resultado como mensagem `tool`;
4. executa `reserve_slot`;
5. injeta o resultado como mensagem `tool`;
6. so entao aceita uma resposta final textual para o tutor.

Tambem foi coberto o fluxo de confirmacao:

1. conversa possui `schedulingState.stage = waiting_slot_confirmation`;
2. modelo chama `confirm_appointment`;
3. resultado da tool e injetado no contexto;
4. resposta final de confirmacao so vem depois da tool.

## Garantia Validada

A regra operacional abaixo agora tem cobertura automatizada no client OpenAI:

```text
O agente nunca deve confirmar horario sem confirm_appointment retornar sucesso.
```

Observacao: o teste valida o contrato do client e a sequencia de tool calls. A state machine deterministica do runtime para confirmacao pendente ja estava coberta em `tests/unit/agent-runtime-scheduling.test.ts`.

## Validacao Executada

| Comando | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm test` | passou, 166 testes em 21 suites |
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

## Estado Atual das Lacunas

| Lacuna | Estado |
|---|---|
| Tool calling OpenAI | Implementado e testado |
| Consulta de slots por tool | Testada no client |
| Reserva por tool | Testada no client |
| Confirmacao por tool | Testada no client |
| Confirmacao deterministica no runtime | Testada anteriormente |
| E2E contra Chatwoot/EvolutionAPI reais | Pendente |
| Qdrant real em staging | Pendente |
| Cobertura agregada 80%+ | Pendente |
| Runbook final | Concluido em `docs/49_production_runbook.md` |

## Atualizacao Posterior

Status em 2026-05-27 apos `docs/50_runbook_and_release_readiness_progress.md`:

- `.env.example` foi criado;
- `docker-compose.yml` foi atualizado com as variaveis novas e sem `version` obsoleto;
- `docs/49_production_runbook.md` foi criado com deploy, release gate, rollback e incidentes;
- `docker compose --env-file .env.example config` passou;
- `npm run lint`, `npm run typecheck` e testes focados de seguranca/scheduling passaram.
