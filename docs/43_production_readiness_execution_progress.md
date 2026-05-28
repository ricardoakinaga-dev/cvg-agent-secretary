# 43 - Progresso de Execucao do Plano de Producao Real

## Data

2026-05-27

## Resumo Executivo

Foi executado o primeiro bloco material do plano descrito em `docs/42_production_real_readiness_plan.md`.

O projeto saiu de um estado com lint quebrado, vulnerabilidades conhecidas e endpoints operacionais sem protecao para uma base mais segura:

- lint restaurado;
- dependencias auditadas sem vulnerabilidades conhecidas;
- `/api` protegido por token + RBAC;
- webhook Chatwoot com validacao HMAC-SHA256;
- guardrails programaticos conectados ao runtime;
- handoff agora cria registro operacional e nota/labels no Chatwoot;
- agenda transacional inicial adicionada;
- API administrativa inicial para knowledge adicionada.

## Itens Executados

### 1. Lint e vulnerabilidades

Status: **concluido**

Entregas:

- adicionada configuracao `.eslintrc.cjs`;
- atualizado `@typescript-eslint`;
- removida dependencia vulneravel `uuid`;
- substituido uso de `uuid.v4()` por `crypto.randomUUID()`;
- removido `console.log` de `knowledge/chunking.ts` em favor de logging estruturado.

Validacao:

```bash
npm run lint
npm audit --omit=dev
npm audit
```

Resultado:

- lint passou;
- audit de producao passou;
- audit completo passou.

### 2. Autenticacao/RBAC nos endpoints `/api`

Status: **concluido para endpoints existentes**

Entregas:

- novo middleware `src/middleware/auth.ts`;
- suporte a `x-api-key` e `Authorization: Bearer`;
- uso de `API_ADMIN_TOKEN`;
- role via `x-user-role`;
- aplicacao de permissoes do RBAC existente;
- protecao dos endpoints:
  - `/api/analytics/dashboard`
  - `/api/metrics`
  - `/api/audit/events`
  - `/api/operational-report`
  - `/api/knowledge/*`

Testes adicionados:

```text
tests/unit/auth-middleware.test.ts
```

### 3. Validacao de assinatura do webhook Chatwoot

Status: **concluido**

Entregas:

- novo middleware `src/middleware/chatwoot-signature.ts`;
- captura de raw body no `express.json`;
- validacao HMAC-SHA256 usando `CHATWOOT_WEBHOOK_SECRET`;
- suporte a headers:
  - `x-chatwoot-signature`
  - `x-hub-signature-256`
  - `x-signature`

Testes adicionados:

```text
tests/unit/chatwoot-signature.test.ts
```

### 4. Guardrails antes/depois da IA no `agentRuntime`

Status: **concluido como primeira integracao**

Entregas:

- `checkGuardrails()` conectado antes da chamada ao modelo;
- mensagens bloqueadas por guardrail nao seguem para IA;
- `checkResponseGuardrails()` conectado antes de enviar resposta ao Chatwoot;
- resposta proibida por diagnostico/prescricao/prognostico vira fallback seguro com handoff;
- eventos `fallback_triggered` registrados em bloqueios.

Arquivo principal:

```text
src/modules/runtime/agentRuntime.ts
```

### 5. Handoff real e auditavel

Status: **concluido como fluxo operacional basico**

Entregas:

- tabelas `handoffs` e `sector_notifications` adicionadas ao schema;
- `agentRuntime` cria registro em `handoffs` quando `agentResponse.action.type === 'handoff'`;
- Chatwoot recebe labels e nota privada com resumo da conversa;
- `handoff_triggered` inclui `handoffId` em analytics e audit trail;
- falha de handoff registra `error_occurred`.

Arquivos principais:

```text
database/schema.sql
src/modules/runtime/agentRuntime.ts
src/modules/handoff/repository.ts
src/modules/chatwoot/integration.ts
```

### 6. Agenda real com tools transacionais

Status: **fundacao inicial adicionada**

Entregas:

- tabelas:
  - `appointment_services`
  - `appointment_providers`
  - `appointment_slots`
  - `appointments`
- modulo `src/modules/scheduling`;
- repository com transacao para reserva, confirmacao e cancelamento;
- tools:
  - `check_available_slots`
  - `reserve_slot`
  - `confirm_appointment`
  - `cancel_appointment`
  - `reschedule_appointment`

Regra operacional implementada no design:

```text
Confirmacao de horario passa pela tool `confirm_appointment`.
```

Testes adicionados:

```text
tests/unit/scheduling-tools.test.ts
```

Limitacao restante:

- as tools de agenda ainda nao estao conectadas ao LLM via tool calling real;
- ainda falta estado conversacional de agendamento no runtime.

### 7. Base de conhecimento com pipeline administrativo

Status: **API administrativa minima adicionada**

Entregas:

- novo router `src/modules/knowledge/adminRoutes.ts`;
- `knowledgeRepository.listDocuments()`;
- endpoints protegidos:
  - `GET /api/knowledge/documents`
  - `POST /api/knowledge/documents`
  - `PATCH /api/knowledge/documents/:id`
  - `POST /api/knowledge/documents/:id/publish`
- publicacao continua acionando o pipeline documento -> chunks.

Limitacao restante:

- ainda falta UI/admin completo;
- ainda falta teste E2E do fluxo administrativo;
- Qdrant segue nao implementado.

## Validacao Executada

| Comando | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm test` | passou, 124 testes em 11 suites |
| `npm run test:coverage` | passou |
| `npm run build` | passou |
| `npm audit --omit=dev` | passou, 0 vulnerabilidades |
| `npm audit` | passou, 0 vulnerabilidades |
| `docker build -t cvg-secretary-agent:codex-check .` | passou |

Cobertura atual:

| Metrica | Valor |
|---|---:|
| Statements | 76.69% |
| Branches | 69.01% |
| Functions | 82.41% |
| Lines | 77.97% |

## Estado Atual do Roadmap

| Frente | Estado |
|---|---|
| Lint e vulnerabilidades | Concluido |
| Auth/RBAC em `/api` | Concluido para endpoints atuais |
| Assinatura webhook Chatwoot | Concluido |
| Guardrails runtime | Primeira integracao concluida |
| Handoff operacional | Basico concluido |
| Agenda transacional | Fundacao concluida, falta conectar ao fluxo conversacional |
| Knowledge admin | API minima concluida, falta E2E/admin UI |
| Qdrant | Pendente |
| Tool calling real do LLM | Pendente |
| Estado conversacional de agendamento | Pendente |

## Proximos Passos Recomendados

1. Implementar tool calling real no provedor de IA.
2. Conectar tools de agenda ao fluxo de conversa.
3. Criar estado conversacional para agendamento.
4. Implementar adapter Qdrant opcional com fallback Postgres.
5. Adicionar testes E2E para:
   - webhook Chatwoot assinado;
   - guardrails;
   - handoff;
   - knowledge publish;
   - reserva/confirmacao de agenda.
6. Elevar cobertura para 80%+ em statements/lines.

## Veredito Atual

O projeto deu um salto importante de prontidao tecnica. Os bloqueadores P0 mais graves foram fechados, e as fundacoes para handoff, agenda e knowledge admin foram adicionadas.

Ainda nao e producao real autonoma completa porque faltam tool calling real, estado conversacional de agendamento e Qdrant. Mas a base atual esta significativamente mais proxima de producao assistida robusta e de um caminho claro para producao real.
