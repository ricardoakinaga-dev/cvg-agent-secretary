# 69 - Runbook de Direitos do Titular

## Objetivo e escopo

Executar acesso/exportacao, anonimizacao e eliminacao de um titular de forma autenticada, tenant-aware, idempotente e auditavel nos stores aplicaveis: PostgreSQL, Redis, Qdrant e logs.

Este runbook nao decide se um pedido deve ser atendido. Validacao de identidade, representacao, prazo legal, excecao e legal hold pertencem ao processo aprovado pelo hospital e pelo Encarregado/DPO.

## Pre-requisitos

- ticket com numero, finalidade e decisao do Encarregado/DPO;
- identidade do operador em JWT assinado e role `admin` para mutacoes;
- tenant resolvido server-side, nunca fornecido pelo solicitante;
- contato localizado por UUID tenant-scoped, depois de validar identidade por canal independente;
- adapters reais configurados para stores com dado pessoal;
- atestacao versionada para qualquer store declarado sem dado pessoal;
- backup/checkpoint testado para mutacoes irreversiveis;
- idempotency key unica por operacao.

## Endpoints para integracao

O factory `createPrivacyRouter(service, resolveTenantId)` esta montado pelo processo principal sob autenticacao em `/api/privacy`. Ele aplica autorizacao adicional em cada operacao.

| Operacao | Endpoint relativo | Permissao atual | Corpo minimo |
|---|---|---|---|
| Dry-run de retencao | `POST /retention/preview` | `privacy:read` | `idempotencyKey` |
| Expurgo de retencao | `POST /retention/purge` | `privacy:delete` | `idempotencyKey`, `approvedPreviewReceiptId`, `recoveryCheckpointId`, `confirm: true` |
| Exportar titular | `POST /subjects/:contactId/export` | `privacy:read` | `idempotencyKey` |
| Anonimizar titular | `POST /subjects/:contactId/anonymize` | `privacy:delete` | `idempotencyKey`, `recoveryCheckpointId`, `confirm: true` |
| Eliminar titular | `POST /subjects/:contactId/erase` | `privacy:delete` | `idempotencyKey`, `recoveryCheckpointId`, `confirm: true` |

Dry-run e exportacao usam `privacy:read`; expurgo, anonimizacao e eliminacao usam `privacy:delete`. Ambas as permissoes estao restritas ao papel `admin`.

## Exportacao

1. Validar ticket, identidade e tenant.
2. Gerar idempotency key sem PII, por exemplo UUID do ticket.
3. Executar exportacao; o servico faz preflight e consulta todos os adapters.
4. Validar se PostgreSQL cobre contato, animais, memorias, conversas, mensagens, resumos, tools, handoffs, notificacoes, agenda, follow-ups e audit logs aplicaveis.
5. Tratar o arquivo como sensivel: criptografar, definir TTL curto e entregar por canal autenticado.
6. Nunca anexar o payload ao log ou ao `audit_events`; anexar somente receipt ID/evidence hash ao ticket.
7. Eliminar a copia de trabalho apos confirmacao da entrega.

Uma repeticao de exportacao exige nova idempotency key para produzir snapshot atual. O receipt anterior continua sendo prova do snapshot anterior.

## Anonimizacao

1. Confirmar que a finalidade permite preservar registro anonimizado.
2. Registrar checkpoint de recuperacao.
3. Executar exportacao previa quando autorizada.
4. Chamar anonimizacao com checkpoint verificado e `confirm: true`.
5. O adapter PostgreSQL substitui identificadores por pseudonimo deterministico, limpa texto/JSON sensivel e desativa memoria/cadastro.
6. Redis, Qdrant e logs devem executar seus delegates ou retornar atestacao valida de nao aplicabilidade.
7. Reexecutar exportacao e busca independente para confirmar ausencia de identificadores diretos.
8. Anexar contagens e evidence hash ao ticket.

## Eliminacao

1. Confirmar que nao existe legal hold ou obrigacao de conservacao conflitante.
2. Registrar aprovacao em quatro olhos e checkpoint.
3. Executar exportacao previa somente se autorizada.
4. Chamar eliminacao com checkpoint verificado e `confirm: true`.
5. Repetir a mesma idempotency key somente para recuperar o mesmo receipt; nunca criar nova key para "tentar de novo" uma falha parcial sem reconciliar.
6. Consultar todos os stores e o Chatwoot/fornecedor quando estiverem no escopo aprovado.
7. Registrar resposta ao titular sem expor detalhes internos da infraestrutura.

## Falha parcial e reconciliacao

O servico faz preflight antes de mutar, mas nao existe transacao distribuida entre PostgreSQL, Redis, Qdrant e backend de logs. Se um store falhar:

1. a API retorna falha sanitizada e nao emite receipt de sucesso;
2. localizar o evento `started`/`failed` por `operationId`;
3. usar `completedStores` para identificar o que ja ocorreu;
4. bloquear nova operacao automatica com a mesma/diferente key;
5. verificar cada store por leitura independente;
6. concluir manualmente os stores restantes com o mesmo escopo ou restaurar pelo checkpoint;
7. emitir evento de reconciliacao revisado por segunda pessoa;
8. abrir incidente se houve indisponibilidade, exposicao ou perda fora da decisao aprovada.

## Evidencia esperada

Cada sucesso gera receipt com:

- `operationId` e receipt ID;
- tenant e ator verificado;
- idempotency key sem PII;
- tipo e horario;
- hash do escopo, hash da evidencia e contagens agregadas;
- nenhum UUID bruto do contato ou payload exportado.

O hash e tamper-evident somente quando o evento permanece no storage de auditoria protegido. Restricao de escrita, backup e monitoramento de `audit_events` continuam obrigatorios.

## Integracoes concluidas

- router autenticado montado em `/api/privacy`, com tenant configurado server-side;
- gateway/store/auditoria PostgreSQL e adapter Redis real;
- catalogo configuravel de checkpoints, policy injetada e atestacoes obrigatorias;
- RBAC dedicado, migration de idempotencia e metricas sanitizadas;
- testes unitarios e gate de stores reais no CI.

## Pendencias externas

- DPO/owner aprovarem policy, legal holds, inventario e atestacoes;
- conectar backend real de backup, logs/metricas/alertas e provar restore;
- executar E2E do fluxo de direitos nos stores e fornecedores do ambiente alvo;
- substituir atestacao por adapter especifico se Qdrant/logs reais contiverem dado de titular.
