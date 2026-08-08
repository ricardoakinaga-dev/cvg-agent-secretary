# 70 - Registros de Decisao de Arquitetura

## Estado

Decisoes tecnicas implementadas em 02/08/2026. A aprovacao executiva, de privacidade e de operacao continua registrada como pendencia em `docs/72_residual_risk_and_go_no_go.md`.

## ADR-001 - Isolamento por tenant

**Decisao:** todo registro persistido, chave Redis, job e payload Qdrant usa `tenant_id/account_id`. PostgreSQL aplica filtros explicitos, chaves compostas e RLS; o pool fixa `app.tenant_id` na abertura da conexao.

**Alternativas rejeitadas:** banco global sem tenant; schema por cliente; identificacao apenas no gateway.

**Consequencias:** migracoes e repositorios devem sempre receber a conta configurada; operacoes cross-tenant falham; uma nova conta exige provisionamento e testes de isolamento.

**Evidencia:** migration `20260802_add_tenant_isolation.sql`, testes `tenant-*` e integracao real em `real-stores.integration.test.ts`.

## ADR-002 - Identidade operacional assinada

**Decisao:** API administrativa aceita JWT RS256 com assinatura, issuer, audience, expiracao, `sub` e role validados. Headers autodeclarados nao formam identidade. Token legado existe apenas com flag explicita fora de producao.

**Alternativas rejeitadas:** `x-user-role`; API key compartilhada como identidade humana; role enviada no body.

**Consequencias:** o IdP deve publicar/entregar a chave RSA e emitir claims compativeis; rotacao requer sobreposicao controlada ou deploy coordenado da chave publica.

**Evidencia:** `src/modules/auth/token-verifier.ts`, middleware de autenticacao e testes `token-verifier`/`auth-middleware`.

## ADR-003 - Webhook fail-closed e assíncrono

**Decisao:** webhook Chatwoot exige HMAC sobre timestamp e corpo bruto, janela temporal, conta/inbox autorizadas e schema estrito. Um hash da entrega faz deduplicacao atomica junto ao enqueue. O processamento usa lease com owner, heartbeat, retry atrasado e DLQ limitada.

**Alternativas rejeitadas:** segredo opcional; assinatura sem timestamp; fila em memoria; recuperacao global de inflight sem owner.

**Consequencias:** a configuracao real do Agent Bot/Chatwoot deve produzir os headers esperados; mudanca de contrato exige nova evidencia em staging antes do rollout.

**Evidencia:** middleware de assinatura, `src/modules/webhook`, fila Redis e testes `chatwoot-signature`, `redis-webhook-queue` e `webhook-worker`.

## ADR-004 - Minimizacao e seguranca de IA

**Decisao:** contexto e identificadores sao minimizados/pseudonimizados antes do provedor; tools usam schemas Zod estritos, ownership e confirmacao corroborada pelo turno atual. Guardrails clinicos deterministas bloqueiam diagnostico, prescricao, prognostico, emergencia insegura, jailbreak e exfiltracao.

**Alternativas rejeitadas:** enviar contexto integral; confiar no schema declarado ao modelo; `confirmed: true` sem evidencia da mensagem; confianca fixa.

**Consequencias:** a qualidade deve ser monitorada por classe; baixa evidencia produz fallback/handoff; qualquer novo tool ou provedor requer avaliacao clinica e de privacidade.

**Evidencia:** `ai-data-minimizer`, `agent-tools/validation`, `clinical-eval` e dataset versionado em `tests/fixtures/clinical-evals/v1.json`.

## ADR-005 - Topologia e stores

**Decisao:** aplicacao sem DDL e sem superuser; migration executada por identidade separada; Redis autenticado por ACL; Qdrant remoto somente com HTTPS e API key; imagens pinadas por digest. TLS pode ser dispensado apenas em rede privada explicitamente atestada.

**Alternativas rejeitadas:** superuser no runtime; Redis anonimo; Qdrant HTTP remoto; tags Docker mutaveis.

**Consequencias:** producao deve fornecer secret manager, terminacao TLS/rede privada comprovada, backups e observabilidade externos. O Compose local nao e evidencia suficiente desses controles externos.

**Evidencia:** `database/init`, validacao de configuracao, Dockerfile/Compose e gate de stores reais do CI.

## ADR-006 - Privacidade governada por policy aprovada

**Decisao:** endpoints de privacidade ficam desabilitados ate receber policy, catalogo de checkpoints e atestacoes versionadas. Exportacao, anonimizacao, eliminacao e expurgo exigem ator/tenant server-side, idempotencia e comprovante; mutacoes irreversiveis exigem checkpoint verificado.

**Alternativas rejeitadas:** prazos juridicos hardcoded; expurgo automatico sem dry-run; declarar store sem PII sem atestacao.

**Consequencias:** `PRIVACY_ENABLED=true` so pode ser usado depois das aprovacoes do DPO e owner hospitalar. Redis possui adapter real; Qdrant/logs dependem das atestacoes ou de futuros adapters do backend escolhido.

**Evidencia:** `src/modules/privacy`, migration de idempotencia e documentos 67-69.

## ADR-007 - Criptografia seletiva de PII de contatos

**Decisao:** nome, e-mail, telefones, endereco, cidade, UF, CEP, CPF e notas de contato sao protegidos na aplicacao com AES-256-GCM e AAD vinculada a tenant, entidade, registro e campo. Consultas exatas usam indices cegos HMAC-SHA-256 com chave separada; o banco conserva somente um pseudonimo no campo `name`. Producao falha fechada sem chave ativa valida ou enquanto houver contato ativo legado sem backfill.

**Ameacas mitigadas:** leitura de snapshot, replica, dump, console SQL ou volume por agente que nao possua as chaves; troca de ciphertext entre tenant, registro ou campo; exposicao direta de e-mail/telefone/CPF em indices; persistencia acidental de input sensivel no log do repositorio.

**Risco residual:** processo da aplicacao ou secret manager comprometido pode descriptografar dados; Chatwoot e provedores autorizados continuam dentro do fluxo aprovado; indices cegos revelam igualdade/frequencia dentro do tenant; busca parcial por nome deixa de existir. O controle nao substitui IAM, TLS, retencao, DPA nem minimizacao.

**Alternativas rejeitadas:** TDE como unico controle; hash sem chave para valores de baixa entropia; criptografia deterministica do campo; chave unica compartilhada entre criptografia e consulta; chave hardcoded.

**Consequencias:** chaves ficam somente no secret manager; a key ring conserva temporariamente chaves antigas para leitura e a escrita sempre usa a chave ativa. `npm run pii:backfill` executa migracao/rotacao idempotente em lotes e deve terminar antes de retirar a chave antiga. Exportacao do titular descriptografa sob autorizacao; anonimizacao remove ciphertext e indices.

**Evidencia:** `field-encryption.ts`, `contacts/pii.ts`, migration `20260802_encrypt_contact_pii.sql` e testes `field-encryption`, `contact-pii` e `contact-pii-backfill`.

## ADR-008 - Um caminho ativo por integracao

**Decisao:** mensagens externas entram e saem pelo Chatwoot; a EvolutionAPI permanece apenas no smoke E2E. Retrieval usa `QdrantHybridStore` ou fallback PostgreSQL; geracao usa `AIRouter`. O adaptador Qdrant antigo, o provider WhatsApp direto e as camadas `intelligence` sem consumidor foram removidos depois de busca integral de imports de producao.

**Consequencias:** novos canais e estrategias de ranking entram como adapters do contrato ativo, com wiring de producao e teste E2E; nao serao mantidas implementacoes paralelas apenas por testes unitarios. Os arquivos removidos continuam recuperaveis pelo historico Git.

**Evidencia:** barrels de `ai`/`knowledge`, `agentRuntime`, classificador de intencao e workflow de revisao de conhecimento modularizados, busca de consumidores em `src` e suites `runtime-modularization`/`qdrant-vector-store`.

## ADR-009 - Auditoria critica transacional e append-only

**Decisao:** aprovacao, rejeicao e publicacao de conhecimento aceitam somente `AuditPrincipal` opaco derivado de identidade server-side. A mutacao, o outbox idempotente e a projecao de auditoria compartilham a mesma transacao; eventos fora de transacao permanecem no outbox para reconciliacao concorrente. Detalhes sao allowlisted e o hash canonico detecta alteracao.

**Consequencias:** falha de auditoria aborta mutacao critica; registros aceitos nao podem sofrer `UPDATE`/`DELETE` pela role normal; eventos legados sao explicitamente nao verificados. Superuser continua sendo fronteira administrativa e WORM absoluto exige sink externo.

**Evidencia:** migration `20260802_z_audit_outbox.sql`, `modules/audit/service.ts` e testes `audit-outbox` com PostgreSQL real.

## ADR-010 - Entrega externa duravel e reconciliavel

**Decisao:** cada webhook aceito gera um `inbound_receipt` duravel e cada resposta automatica gera um `response_outbox` antes do POST ao Chatwoot. A chave logica combina tenant, conversa Chatwoot e mensagem inbound. O envio inclui uma marca `cvg_idempotency_key`; estados `unknown` nao fazem novo POST automaticamente e precisam de consulta automatica ou confirmacao autenticada no Chatwoot.

**Consequencias:** uma falha depois do aceite externo nao e tratada como falha limpa; ela permanece visivel para reconciliacao. O worker pode repetir o turno sem repetir o efeito externo, e o webhook de saida pode reconciliar a intencao mesmo quando o processo caiu antes de gravar o ID local.

**Evidencia:** `src/modules/webhook/inboxRepository.ts`, `src/modules/runtime/responseOutboxRepository.ts`, `src/modules/runtime/messageDelivery.ts`, `src/modules/runtime/responseAdminRoutes.ts`, migration `20260807_durable_delivery_pipeline.sql` e testes de crash/reconciliacao.

## ADR-011 - Handoff fail-closed com controle duravel

**Decisao:** PostgreSQL e a fonte de verdade do bloqueio de automacao. Handoff e persistido como `pending` antes da resposta, efeitos Chatwoot sao idempotentes e o estado so vira ativo depois da reconciliacao dos efeitos exigidos. Expiracao nao reabre o bot; somente operador autenticado pode retomar, concluir ou cancelar. Transicoes de resolucao usam a versao persistida para rejeitar concorrencia obsoleta.

**Consequencias:** uma falha de Redis, label, nota ou API mantem a conversa bloqueada e recuperavel. A operacao precisa acompanhar alertas de handoff e usar a rota de resolucao com justificativa auditada.

**Evidencia:** `conversation_control_state`, `src/modules/handoff/controlService.ts`, `src/modules/runtime/operationalHandoff.ts`, `src/modules/runtime/humanTakeover.ts`, migration `20260811_handoff_expiration_control.sql` e testes de expiracao, reidratacao e controle.

## ADR-012 - Trava de go-live e reconciliacao de side effects

**Decisao:** uma imagem de producao falha fechada se `AUTONOMOUS_AGENT_ENABLED` e `PRODUCTION_GO_LIVE_APPROVED` nao estiverem explicitamente habilitados. Claims de tools mutaveis sao duraveis; estado pendente/erro exige decisao de confirmacao ou retry por operador admin/manager, com motivo hash e auditoria. Alertas de DLQ, envio desconhecido, handoff falho e conflito de versao sao obrigatorios.

**Consequencias:** ativar o agente autonomo passa a ser uma decisao operacional explicita, e nao um efeito colateral de subir o container. O Compose continua seguro por padrao, e a homologacao deve produzir a evidencia antes de mudar as flags.

**Evidencia:** `src/config/index.ts`, `src/modules/agent-tools/adminRoutes.ts`, `deploy/monitoring/prometheus-alerts.yml`, `deploy/monitoring/grafana-dashboard.json`, migrations `20260809_tool_execution_idempotency.sql`/`20260812_tool_execution_reconciliation.sql` e testes de configuracao/RBAC/alertas.

## ADR-013 - Confirmacao da mensagem Chatwoot e marcador em formatos de webhook

**Decisao:** quando `CHATWOOT_CONFIRM_INBOUND_MESSAGES=true`, o worker consulta o Chatwoot pelo `chatwootConversationId` e `chatwootMessageId` antes de executar o turno e rejeita a confirmacao se o registro nao for publico e incoming. O normalizador e o inbox preservam `content_attributes.cvg_idempotency_key` tanto no payload aninhado quanto no formato flat emitido por algumas versoes do Chatwoot. A reconciliacao automatica de resposta usa o marcador; igualdade de conteudo permanece somente fallback de desenvolvimento e e proibida em producao.

**Alternativas rejeitadas:** confiar apenas no corpo assinado sem consulta quando o modo estrito esta ativo; identificar resposta por texto igual; descartar atributos flat por nao estarem em `message`.

**Consequencias:** o staging pode provar a existencia da mensagem antes do processamento e aguardar a resposta marcada; o ambiente alvo precisa aceitar a latencia/capacidade da consulta e registrar o contrato real do webhook. Falha da consulta mantém o evento recuperavel na fila/DLQ e nao libera IA ou tools.

**Evidencia:** `src/modules/webhook/worker.ts`, `src/modules/chatwoot/normalizer.ts`, `src/modules/validation/schemas.ts`, `src/modules/readiness/stagingSmoke.ts`, testes `webhook-worker`, `human-takeover-persistence`, `chatwoot-client` e `staging-smoke`.

## ADR-014 - Smoke externo sem falso positivo de atendimento

**Decisao:** o smoke básico valida somente liveness, readiness e aceite `202`. A validação do atendimento Chatwoot exige configurar `CHATWOOT_API_URL`, `CHATWOOT_API_TOKEN` e `SMOKE_CHATWOOT_MESSAGE_ID`; nesse modo o teste confirma o inbound real antes de enviar o webhook e aguarda uma mensagem outgoing com a chave lógica do turno. O fluxo WhatsApp/EvolutionAPI continua separado e exige execução real no staging.

**Alternativas rejeitadas:** tratar `202` como resposta final; gerar um ID sintético e declarar E2E; consultar conteúdo sem marcador como prova de entrega.

**Consequencias:** o resultado do smoke explicita a etapa que falhou e não submete evento sintético quando a mensagem real não foi encontrada. A validação ainda não prova a entrega final no WhatsApp sem a etapa EvolutionAPI/WhatsApp.

**Evidencia:** `src/modules/readiness/stagingSmoke.ts`, `.github/workflows/staging-smoke.yml`, `tests/unit/staging-smoke.test.ts` e `docs/61_final_whatsapp_e2e_validation.md`.

## ADR-015 - Estado de agendamento duravel fora do Redis

**Decisao:** `conversation_scheduling_state` e a fonte autoritativa do fluxo de agenda, com chave composta por tenant e conversa, RLS e timestamp controlado pelo PostgreSQL. Redis permanece somente como cache; um estado legado encontrado no cache precisa ser persistido antes de influenciar qualquer confirmacao ou cancelamento.

**Alternativas rejeitadas:** manter agenda somente em Redis; continuar a executar confirmacao com cache stale; ignorar estado legado sem migracao controlada.

**Consequencias:** perda ou restart do Redis nao apaga a etapa da agenda, mas a migration `20260813_durable_scheduling_state.sql` passa a ser obrigatoria antes do worker. Privacidade deve incluir exportacao, anonimizacao e eliminacao do novo recurso.

**Evidencia:** `src/modules/scheduling/stateRepository.ts`, `src/modules/scheduling/state.ts`, `database/schema.sql`, migration `20260813_durable_scheduling_state.sql`, `tests/unit/scheduling-state*.test.ts` e adapters de privacidade.

## ADR-016 - Identidade estrita para respostas e takeover humano

**Decisao:** reconciliacao de resposta exige mensagem outgoing publica e marcador `cvg_idempotency_key` em producao. Confirmacao administrativa aplica o mesmo filtro. O fallback por conteudo e permitido somente fora de producao mediante flags explicitas; takeover humano nao pode tratar texto igual como identidade do bot quando o modo estrito esta ativo.

**Alternativas rejeitadas:** aceitar mensagem incoming/private por texto igual; confirmar manualmente qualquer outgoing com o mesmo conteudo; usar hash de conteudo como prova de autoria do bot.

**Consequencias:** ambientes sem marcador real ficam bloqueados para reconciliacao automatica e exigem contrato Chatwoot aprovado ou intervencao operacional auditada. A compatibilidade de desenvolvimento continua disponivel, mas e rejeitada pela validacao de producao.

**Evidencia:** `src/modules/chatwoot/client.ts`, `src/modules/runtime/responseAdminRoutes.ts`, `src/modules/runtime/humanTakeover.ts`, `src/config/index.ts`, testes de cliente/admin/takeover e variaveis `CHATWOOT_ALLOW_CONTENT_*`.

## Revisao

Qualquer mudanca nestas decisoes deve registrar motivacao, impacto em migracao/rollback, ameaca, PII, testes e aprovadores. Mudancas de tenant, identidade, assinatura ou policy sao bloqueadoras de release.
