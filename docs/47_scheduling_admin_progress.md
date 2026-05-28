# 47 - Progresso: Admin Operacional de Agenda

## Data

2026-05-27

## Resumo

Este documento registra a implementacao da superficie administrativa de agenda prevista no plano `docs/42_production_real_readiness_plan.md`.

Antes deste bloco, o sistema ja tinha schema, repository e tools transacionais de agenda, mas faltava uma forma protegida de cadastrar a oferta operacional:

- servicos;
- profissionais/equipes;
- slots disponiveis.

## Entregas

### 1. Permissoes RBAC de agenda

Foram adicionadas permissoes:

```text
scheduling:read
scheduling:write
```

Regras:

- `admin`, `manager` e `agent` podem ler e escrever agenda;
- `viewer` pode apenas ler agenda.

Arquivo:

```text
src/modules/auth/rbac.ts
```

### 2. Repository administrativo de agenda

Foram adicionados metodos para operar o cadastro base da agenda:

```text
createService()
listServices()
createProvider()
listProviders()
createSlot()
listSlots()
```

Os metodos transacionais existentes continuam responsaveis por:

- `reserveSlot()`
- `confirmAppointment()`
- `cancelAppointment()`

Arquivo:

```text
src/modules/scheduling/repository.ts
```

### 3. API administrativa protegida

Novo router:

```text
src/modules/scheduling/adminRoutes.ts
```

Registrado em:

```text
/api/scheduling
```

Endpoints:

```text
GET  /api/scheduling/services
POST /api/scheduling/services
GET  /api/scheduling/providers
POST /api/scheduling/providers
GET  /api/scheduling/slots
POST /api/scheduling/slots
```

Controles:

- todos os endpoints exigem `authenticateApi`;
- leitura exige `scheduling:read`;
- escrita exige `scheduling:write`;
- payloads passam por Zod;
- slots rejeitam `endsAt <= startsAt`.

Arquivo:

```text
src/app.ts
```

## Testes Adicionados

Novos/alterados:

```text
tests/unit/scheduling-admin-routes.test.ts
tests/unit/scheduling-repository.test.ts
tests/unit/rbac.test.ts
```

Cobertura dos testes:

- `/api/scheduling` rejeita chamada sem token;
- `viewer` pode listar, mas nao criar;
- `agent/manager` podem criar servicos, providers e slots;
- slots invalidos nao chegam ao repository;
- repository cobre defaults, filtros opcionais e transacoes;
- reserva indisponivel executa rollback;
- confirmacao marca slot como `booked`;
- cancelamento libera slot como `available`.

## Validacao Executada

| Comando | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm test` | passou, 164 testes em 20 suites |
| `npm run test:coverage` | passou |
| `npm run build` | passou |
| `npm audit --omit=dev` | passou, 0 vulnerabilidades |
| `docker build -t cvg-secretary-agent:codex-check .` | passou |

Cobertura atual:

| Metrica | Valor |
|---|---:|
| Statements | 68.63% |
| Branches | 57.82% |
| Functions | 71.75% |
| Lines | 69.12% |

## Impacto no Plano Original

| Item do plano | Estado apos este bloco |
|---|---|
| Agenda real com tools transacionais | Mais completo: agora ha API admin para oferta da agenda |
| Modelo de agenda | Concluido como schema + repository |
| Tool `check_available_slots` | Concluido |
| Tool `reserve_slot` | Concluido |
| Tool `confirm_appointment` | Concluido |
| Estado conversacional | Parcial, confirmacao pendente deterministica concluida |
| Admin operacional de slots | Implementado como API protegida |

## Lacunas Restantes

1. E2E multi-turn completo de agenda com tool calling real:
   - tutor pede horario;
   - agente consulta slots;
   - agente reserva;
   - tutor confirma;
   - confirmacao passa por `confirm_appointment`.
2. Validacao Qdrant com instancia real de staging.
3. Elevar cobertura agregada para 80%+.
4. Runbook final de producao, rollback e incidentes.

## Atualizacao Posterior

Status em 2026-05-27 apos o bloco `docs/48_openai_tool_calling_e2e_progress.md`:

- foi adicionado teste do client OpenAI simulando tool calls reais;
- o teste cobre `check_available_slots`, `reserve_slot` e `confirm_appointment`;
- o resultado de cada tool e reinjetado como mensagem `tool`;
- a resposta final de confirmacao so ocorre depois de `confirm_appointment`.

Validacao atualizada:

| Comando | Resultado |
|---|---|
| `npm test` | passou, 166 testes em 21 suites |
| `npm run test:coverage` | passou |
| `npm run build` | passou |
| `npm audit --omit=dev` | passou, 0 vulnerabilidades |
| `docker build -t cvg-secretary-agent:codex-check .` | passou |

Cobertura atualizada:

| Metrica | Valor |
|---|---:|
| Statements | 68.48% |
| Branches | 57.40% |
| Functions | 70.81% |
| Lines | 68.98% |
