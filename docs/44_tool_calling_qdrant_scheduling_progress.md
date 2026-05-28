# 44 - Progresso: Tool Calling, Qdrant e Agenda Conversacional

## Data

2026-05-27

## Resumo Executivo

Este documento registra o segundo bloco de execucao do plano de producao real.

Foram enderecados tres gaps que ainda estavam abertos apos o documento `43_production_readiness_execution_progress.md`:

1. tool calling real no provedor OpenAI;
2. estado conversacional inicial para agenda;
3. adapter Qdrant opcional com fallback PostgreSQL full-text.

## 1. Tool Calling Real

Status: **implementado para OpenAI**

Foi criado um registry central de tools em:

```text
src/modules/agent-tools/registry.ts
```

Tools expostas ao modelo:

- `search_knowledge`
- `check_available_slots`
- `reserve_slot`
- `confirm_appointment`
- `cancel_appointment`
- `reschedule_appointment`
- `create_handoff`
- `notify_sector`

O `OpenAIClient` agora:

- envia schemas de tools para Chat Completions;
- aceita `tool_calls`;
- executa cada chamada pelo registry;
- devolve o resultado como mensagem `tool`;
- roda loop curto de ate 3 rodadas de tools;
- so entao produz a resposta final ao tutor.

Arquivo principal:

```text
src/modules/openai/client.ts
```

Limitacao atual:

- OpenRouter segue como fallback textual, sem tool calling real.

## 2. Regra de Confirmacao de Agenda

Status: **implementada no prompt e nas tools**

O prompt principal agora inclui a regra:

```text
NUNCA confirme horario sem a ferramenta confirm_appointment retornar sucesso.
```

A tool `confirm_appointment` passa pelo repository transacional de agenda.

Arquivos:

```text
src/modules/openai/client.ts
src/modules/scheduling/tools.ts
src/modules/scheduling/repository.ts
```

## 3. Estado Conversacional de Agenda

Status: **fundacao implementada**

Foi adicionado estado de agenda por conversa em Redis:

```text
src/modules/scheduling/state.ts
```

Estados suportados:

- `idle`
- `collecting_details`
- `checking_availability`
- `waiting_slot_confirmation`
- `reserved`
- `confirmed`
- `cancelled`

O runtime agora:

- classifica a intencao da mensagem;
- marca intencao `agendamento` ou `cancelamento`;
- injeta o estado de agenda no contexto do modelo;
- permite que as tools atualizem o estado quando reservam, confirmam ou cancelam.

Arquivos principais:

```text
src/modules/runtime/agentRuntime.ts
src/modules/scheduling/state.ts
src/modules/agent-tools/registry.ts
```

Limitacao restante:

- ainda nao ha uma state machine completa com perguntas deterministicas fora do modelo;
- o fluxo depende do modelo usar as tools corretamente, embora a regra de confirmacao esteja explicita.

## 4. Qdrant Opcional com Fallback

Status: **implementado**

Foi criado adapter Qdrant via REST:

```text
src/modules/knowledge/qdrant.ts
```

Variaveis de ambiente:

```text
QDRANT_URL
QDRANT_API_KEY
QDRANT_COLLECTION
```

Comportamento:

- se `QDRANT_URL` estiver configurado, o retrieval tenta inicializar Qdrant;
- se Qdrant estiver saudavel, a busca usa vetor;
- se Qdrant falhar ou nao estiver configurado, o sistema usa PostgreSQL full-text;
- chunks publicados sao enviados ao vector store quando o Qdrant esta ativo;
- o fallback full-text continua disponivel.

Arquivos:

```text
src/modules/knowledge/retrieval.ts
src/modules/knowledge/qdrant.ts
src/modules/knowledge/pipeline.ts
src/config/index.ts
```

## 5. Testes Adicionados

Novos testes:

```text
tests/unit/agent-tool-registry.test.ts
tests/unit/app-security.test.ts
tests/unit/qdrant-vector-store.test.ts
```

O teste HTTP de seguranca valida:

- `/api/metrics` rejeita sem token;
- `/api/audit/events` rejeita usuario sem permissao;
- webhook Chatwoot rejeita assinatura invalida;
- webhook Chatwoot assinado chega ao runtime.

## Validacao Executada

| Comando | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm test` | passou, 136 testes em 14 suites |
| `npm run test:coverage` | passou |
| `npm run build` | passou |
| `npm audit --omit=dev` | passou, 0 vulnerabilidades |
| `docker build -t cvg-secretary-agent:codex-check .` | passou |

Cobertura atual:

| Metrica | Valor |
|---|---:|
| Statements | 73.85% |
| Branches | 63.89% |
| Functions | 73.68% |
| Lines | 74.54% |

## Estado Atual dos Gaps Originais

| Gap | Estado |
|---|---|
| Lint e vulnerabilidades | Concluido |
| Auth/RBAC em `/api` | Concluido para endpoints atuais |
| Assinatura webhook Chatwoot | Concluido |
| Guardrails runtime | Concluido como primeira integracao |
| Handoff auditavel | Basico concluido |
| Agenda real com tools transacionais | Fundacao + tools + estado inicial concluidos |
| Knowledge admin | API minima concluida |
| Qdrant | Adapter opcional concluido |
| Tool calling real | Concluido no OpenAI |
| E2E completo de atendimento | Parcial, ha teste HTTP de seguranca; falta fluxo real Chatwoot -> IA -> Chatwoot com mocks completos |

## Proximos Passos

1. Criar testes integrados do fluxo completo de agendamento:
   - tutor pede horario;
   - agente consulta slots;
   - agente reserva;
   - tutor confirma;
   - `confirm_appointment` retorna sucesso;
   - resposta final confirma o horario.
2. Expandir a state machine deterministica para coleta de dados, escolha de slot, remarcacao e cancelamento.
3. Adicionar endpoint/admin UI para slots de agenda.
4. Testar Qdrant contra uma instancia real em ambiente de staging.
5. Elevar cobertura agregada para 80%+ em statements/lines.

## Veredito Atual

O projeto agora tem as fundacoes tecnicas principais para sair do atendimento puramente textual:

- tools reais;
- agenda transacional;
- estado de agenda;
- RAG vetorial opcional;
- fallback seguro;
- protecoes de API/webhook.

Ainda falta validacao E2E operacional completa antes de declarar producao real autonoma.

## Atualizacao Posterior

Status em 2026-05-27 apos o bloco final registrado em `docs/45_final_execution_status.md`:

- OpenRouter foi restringido para fallback seguro sem acoes operacionais;
- confirmacao pendente de agenda passou a ter state machine deterministica antes da IA;
- foi adicionado teste de runtime garantindo que uma confirmacao de horario pendente nao chama o modelo;
- validacao final: lint, typecheck, testes, coverage, build, audit de producao e Docker passaram.

Validacao final:

| Comando | Resultado |
|---|---|
| `npm test` | passou, 142 testes em 17 suites |
| `npm run test:coverage` | passou conforme thresholds atuais |
| `docker build -t cvg-secretary-agent:codex-check .` | passou |

Cobertura final:

| Metrica | Valor |
|---|---:|
| Statements | 67.32% |
| Branches | 59.66% |
| Functions | 72.05% |
| Lines | 68.03% |
