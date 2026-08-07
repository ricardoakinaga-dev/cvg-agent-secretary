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

## Revisao

Qualquer mudanca nestas decisoes deve registrar motivacao, impacto em migracao/rollback, ameaca, PII, testes e aprovadores. Mudancas de tenant, identidade, assinatura ou policy sao bloqueadoras de release.
