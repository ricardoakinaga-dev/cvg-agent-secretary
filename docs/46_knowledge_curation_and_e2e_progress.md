# 46 - Progresso: Curadoria Knowledge e E2E Parcial do Runtime

## Data

2026-05-27

## Resumo

Este documento registra mais um bloco de execucao do plano `docs/42_production_real_readiness_plan.md`, focado em dois pontos ainda fracos:

1. curadoria administrativa da base de conhecimento;
2. validacao integrada do caminho Chatwoot -> RAG -> IA -> Chatwoot.

## 1. Curadoria da Base de Conhecimento

Status: **implementado**

O fluxo administrativo de knowledge agora tem etapas explicitas:

```text
draft -> pending_review -> approved -> published
draft/pending_review -> rejected
```

Novos metodos no repository:

- `submitForReview(id)`
- `approveDocument(id, approvedBy)`
- `rejectDocument(id, rejectedBy, reason)`

Regra nova:

```text
publishDocument() agora exige status approved.
```

Isso impede que um documento `draft` ou `pending_review` seja publicado diretamente no RAG.

Arquivos alterados:

```text
src/modules/knowledge/repository.ts
src/modules/knowledge/adminRoutes.ts
```

Novos endpoints administrativos:

```text
POST /api/knowledge/documents/:id/submit-review
POST /api/knowledge/documents/:id/approve
POST /api/knowledge/documents/:id/reject
POST /api/knowledge/documents/:id/publish
```

Permissoes:

- `submit-review`: `knowledge:write`
- `approve`: `knowledge:approve`
- `reject`: `knowledge:approve`
- `publish`: `knowledge:publish`

Auditoria:

- aprovacao registra `knowledge_updated` com action `approve`;
- rejeicao registra `knowledge_rejected`;
- publicacao segue registrando `knowledge_published`.

## 2. E2E Parcial do Runtime

Status: **expandido**

Foi adicionado teste cobrindo o caminho principal interno:

```text
Chatwoot webhook normalizado -> knowledge retrieval -> aiRouter.generate -> Chatwoot sendMessage
```

Esse teste prova que o runtime:

- consulta a base de conhecimento;
- injeta chunks no contexto da IA;
- injeta estado de agenda;
- envia a resposta final pelo client Chatwoot;
- registra `response_sent`.

Arquivo:

```text
tests/unit/agent-runtime-scheduling.test.ts
```

## 3. Testes Adicionados

Novo arquivo:

```text
tests/unit/knowledge-repository-review.test.ts
```

Cobertura do teste:

- documento draft vai para review;
- somente documento `pending_review` pode ser aprovado;
- rejeicao grava metadados de rejeicao;
- documento nao aprovado nao pode ser publicado;
- documento aprovado publica e gera chunks.

## Validacao Executada

| Comando | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm test` | passou, 148 testes em 18 suites |
| `npm run test:coverage` | passou conforme thresholds atuais |
| `npm run build` | passou |
| `npm audit --omit=dev` | passou, 0 vulnerabilidades |
| `docker build -t cvg-secretary-agent:codex-check .` | passou |

Cobertura atual:

| Metrica | Valor |
|---|---:|
| Statements | 66.55% |
| Branches | 55.60% |
| Functions | 68.83% |
| Lines | 67.01% |

Observacao: a cobertura ainda esta abaixo da meta operacional de 80%. A queda em relacao ao relatorio anterior ocorreu porque o repository de knowledge passou a entrar mais fortemente no escopo de coverage.

## Estado Atual

| Frente | Estado |
|---|---|
| Lint/vulnerabilidades | Concluido |
| Auth/RBAC | Concluido para endpoints atuais |
| Webhook assinado | Concluido |
| Guardrails runtime | Concluido como primeira integracao |
| Handoff auditavel | Basico concluido |
| Agenda transacional | Backend e tools concluidos |
| Confirmacao deterministica de agenda | Concluido para slot pendente |
| Knowledge admin | Curadoria basica concluida |
| Qdrant opcional | Adapter concluido, falta staging real |
| E2E Chatwoot interno | Parcial com mocks concluido |
| Cobertura 80%+ | Pendente |

## Proximas Lacunas Reais

1. Elevar cobertura para 80%+ com testes em `agent-tools`, `knowledge/repository`, `agentRuntime` e `chatwoot`.
2. Adicionar testes E2E de agenda multi-turn:
   - consulta slot;
   - reserva;
   - confirmacao;
   - impedimento de dupla reserva.
3. Validar Qdrant com instancia real de staging.
4. Criar admin operacional para servicos, profissionais e slots de agenda.
5. Criar runbook final de producao, rollback e incidentes.

## Atualizacao Posterior

Status em 2026-05-27 apos o bloco `docs/47_scheduling_admin_progress.md`:

- admin operacional de servicos, profissionais e slots foi implementado em `/api/scheduling`;
- endpoints usam `authenticateApi` e RBAC com `scheduling:read`/`scheduling:write`;
- repository de agenda ganhou metodos administrativos;
- testes cobrem auth, RBAC, validacao de slot, defaults, filtros e transacoes;
- `npm test` passou com 164 testes em 20 suites;
- `npm run test:coverage`, `npm run build`, `npm audit --omit=dev` e Docker passaram.

Cobertura atualizada:

| Metrica | Valor |
|---|---:|
| Statements | 68.63% |
| Branches | 57.82% |
| Functions | 71.75% |
| Lines | 69.12% |
