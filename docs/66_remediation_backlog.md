# 66 - Backlog de Remediacao

## Objetivo

Manter a fonte operacional unica para resolver todos os problemas registrados em `docs/63_current_project_code_audit.md` e executar `docs/64_executive_remediation_plan.md` conforme `docs/65_remediation_roadmap.md`.

## Uso do Backlog

Este e o unico documento em que o status das tarefas deve ser atualizado.

Valores permitidos:

```text
A Fazer
Em Andamento
Em Review
Bloqueado
Concluido
Cancelado com aceite de risco
```

Uma tarefa nao deve ser marcada como concluida somente porque o codigo foi escrito. Devem existir testes, evidencias, documentacao e validacao dos criterios de aceite.

## Atualizacao de Execucao - 02/08/2026

| Estado | Quantidade | Leitura |
|---|---:|---|
| Em Review | 63 | Implementacao/evidencia tecnica presente; aguarda commit/PR e revisor independente. |
| Em Andamento | 0 | Nenhuma entrega tecnica permanece parcialmente implementada no escopo do repositorio. |
| Bloqueado | 7 | Depende de owner/DPO, contrato Chatwoot, secret manager ou homologacao externa. |
| A Fazer | 2 | Consolidacao Git/PR nao autorizada nesta execucao. |
| Concluido | 0 | Nenhum item e declarado concluido sem cumprir integralmente as Regras de Pronto. |

A decisao executiva atual e os bloqueios nominais estao em `docs/72_residual_risk_and_go_no_go.md`. O estado `Em Review` nao autoriza producao.

## Prioridades

| Prioridade | Significado |
|---|---|
| P0 | Bloqueia uso com dados reais ou representa risco critico de seguranca, privacidade ou perda de integridade. |
| P1 | Necessario antes de escalar, obter release candidate ou operar sem supervisao intensiva. |
| P2 | Sustentabilidade, manutencao, reducao de risco futuro e consolidacao. |

## Estimativas

| Tamanho | Referencia |
|---|---|
| XS | Ate meio dia de engenharia |
| S | 1 a 2 dias |
| M | 3 a 5 dias |
| L | 6 a 10 dias; dividir antes da execucao quando possivel |
| XL | Epico que deve ser decomposto em tarefas menores |

As estimativas nao incluem tempo externo de aprovacao juridica, provisionamento ou homologacao do hospital.

## Regras de Pronto

Todo item concluido deve possuir:

- owner registrado;
- PR ou commit rastreavel;
- teste automatizado proporcional ao risco;
- resultado de lint, typecheck, testes e build aplicaveis;
- evidencias do criterio de aceite;
- migracao e rollback testados quando aplicavel;
- revisao por outra pessoa para itens P0/P1;
- documentacao e runbook atualizados;
- risco residual fechado ou formalmente aceito.

## GOV - Governanca e Baseline

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| GOV-001 | P0 | Congelar features e restringir exposicao durante a remediacao | XS | Nenhuma | Decisao registrada; servico restrito a rede controlada; uma replica ate REL-003 | Bloqueado |
| GOV-002 | P0 | Nomear owners das frentes e aprovadores dos gates | XS | Nenhuma | Owner e aprovador definidos para IAM, TEN/WHK, PRV/DAT, AI, REL/OBS e TST/CICD | Bloqueado |
| GOV-003 | P0 | Registrar decisoes D1-D4 | S | GOV-002 | ADRs aprovam tenant, identidade, politica de dados/IA e topologia | Em Review |
| GOV-004 | P1 | Manter risk register e decisao formal go/no-go | S | GOV-002 | Riscos possuem owner, tratamento e aceite; ata de go/no-go vinculada ao Gate G5 | Em Review |

## REP - Repositorio e Arquitetura

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| REP-001 | P0 | Consolidar o working tree em branch revisavel | M | GOV-001 | Alteracoes atuais separadas em commits/PRs coerentes; checkout limpo reproduz o estado aprovado | A Fazer |
| REP-002 | P0 | Rastrear codigo central, migracoes e testes atualmente untracked | S | REP-001 | Worker, repositorios, migracoes e testes necessarios estao versionados e revisados | A Fazer |
| REP-003 | P1 | Remover `dist` e backups do versionamento ou validar artefatos | S | REP-001 | `dist` nao diverge de `src`; backups saem da arvore ativa; regra documentada no `.gitignore` | Em Review |
| REP-004 | P2 | Dividir arquivos de alto risco e funcoes extensas | L | Gates G1-G3 | `agentRuntime`, classifier e repositorios criticos divididos por responsabilidade sem refatoracao ampla desnecessaria | Em Review |
| REP-005 | P2 | Consolidar adaptadores e modulos nao conectados | M | GOV-003, AI-006 | Qdrant, camadas de IA, WhatsApp direto e intelligence possuem um caminho ativo ou sao arquivados | Em Review |

## IAM - Identidade, Autenticacao e Autorizacao

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| IAM-001 | P0 | Implementar identidade assinada para pessoas e servicos | L | GOV-003 | JWT/OIDC/mTLS validado; issuer, audience, expiracao e assinatura testados; token compartilhado legado nao concede identidade arbitraria | Em Review |
| IAM-002 | P0 | Remover role, user ID e e-mail definidos pelo cliente | M | IAM-001 | `x-user-role`, `x-user-id` e `x-user-email` nao definem claims; ausencia de role nunca resulta em admin | Em Review |
| IAM-003 | P0 | Derivar ator de operacoes e auditoria da identidade verificada | M | IAM-001 | `actor`, `createdBy` e `approvedBy` do body sao ignorados/rejeitados; testes provam atribuicao correta | Em Review |
| IAM-004 | P0 | Revisar matriz RBAC e todas as rotas administrativas | M | IAM-001, IAM-002 | Cada rota tem permissao explicita; testes cobrem allow/deny por papel; menor privilegio aprovado | Em Review |

## TEN - Conta, Tenant e Identidade de Contato

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| TEN-001 | P0 | Validar `account_id` do webhook contra configuracao/tenant | S | GOV-003 | Conta ausente ou diferente retorna erro antes da fila; conta validada integra o DTO interno | Em Review |
| TEN-002 | P0 | Validar inbox/canal autorizado | S | TEN-001, WHK-001 | Evento de inbox/canal nao autorizado e rejeitado; allowlist configurada e testada | Em Review |
| TEN-003 | P0 | Remover fallback de contato por nome | S | TEN-001 | Contato so e associado por chave deterministica; nomes iguais nao compartilham contexto | Em Review |
| TEN-004 | P0 | Tornar schema, indices, filas e caches tenant-aware | XL | GOV-003, TEN-001, DAT-004 | `tenant_id/account_id` participa de FKs, unicidades, queries e chaves; RLS ou controle equivalente aprovado; migracao backfill/rollback e testes cross-tenant aprovados | Em Review |

## WHK - Webhook, Validacao e Disponibilidade de Entrada

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| WHK-001 | P0 | Validar o contrato real de webhook do Chatwoot | M | Ambiente staging | Versao, tipo de canal/Agent Bot, headers, segredo e corpo bruto registrados por evidencia real | Bloqueado |
| WHK-002 | P0 | Exigir segredo, assinatura e timestamp em modo fail-closed | M | WHK-001 | Segredo ausente impede startup conectado; assinatura sem timestamp, invalida ou expirada e rejeitada | Em Review |
| WHK-003 | P0 | Implementar replay protection e idempotencia duravel | M | WHK-002, DAT-002 | Nonce/event ID atomico e tenant-aware; repeticao nao reexecuta resposta nem tool, inclusive apos restart | Em Review |
| WHK-004 | P0 | Restringir schema e tamanho do payload | M | WHK-001 | DTO usa strict/strip, limites de string/array/body, sender e account obrigatorios; campos desconhecidos nao entram na fila | Em Review |
| WHK-005 | P0 | Corrigir rate limit antes do parsing caro | M | Infra proxy definida | Limite por IP confiavel antes do JSON; account so entra na chave depois da assinatura; teste de bypass passa | Em Review |
| WHK-006 | P1 | Tornar rate limit distribuido e configurar `trust proxy` | M | WHK-005, DAT-002 | Limite consistente entre replicas; IP real validado; memoria local nao e fonte unica | Em Review |

## PRV - Privacidade, LGPD e Ciclo de Vida

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| PRV-001 | P0 | Criar inventario e mapa de fluxo de dados | M | GOV-002 | Campos, origem, finalidade, base aprovada, destino, operador, retencao e owner documentados | Em Review |
| PRV-002 | P0 | Aprovar e codificar politica de retencao | L | PRV-001 | Prazos por tabela/fila/log definidos; jobs de dry-run e expurgo possuem metricas, auditoria e rollback seguro | Bloqueado |
| PRV-003 | P0 | Minimizar payload armazenado em Redis e DLQ | M | WHK-004, PRV-001 | Job contem somente DTO necessario; payload bruto nao permanece; DLQ possui TTL/expurgo e metrica | Em Review |
| PRV-004 | P0 | Implementar acesso, exportacao, anonimizacao e eliminacao | L | PRV-001, TEN-004 | Fluxo por titular cobre Postgres, Redis, Qdrant e logs aplicaveis; teste E2E e comprovante de auditoria | Em Review |
| PRV-005 | P0 | Minimizar e pseudonimizar contexto enviado a IA | L | PRV-001, AI-001 | Nomes/IDs e fatos desnecessarios removidos; allowlist de campos; OpenAI/OpenRouter recebem somente contexto necessario; qualidade reavaliada | Em Review |
| PRV-006 | P0 | Formalizar governanca de fornecedores e transferencia | M | PRV-001 | DPA, retencao, regiao, transferencia, suboperadores, incidente e opt-out registrados e aprovados pelo responsavel de privacidade | Bloqueado |

## DAT - Stores, Migracoes, Secrets e Transporte

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| DAT-001 | P0 | Criar role PostgreSQL de aplicacao com menor privilegio | M | GOV-003 | App nao usa superuser nem possui DDL em runtime; permissoes negativas testadas | Em Review |
| DAT-002 | P0 | Proteger Redis com ACL, secret e TLS | M | Topologia D4 | Redis exige credencial fora de ambiente local; TLS/rede privada comprovados; rotacao documentada | Em Review |
| DAT-003 | P1 | Proteger Qdrant com TLS e API key | M | Topologia D4 | HTTP/chave vazia rejeitados fora de loopback; credencial rotacionavel; erros remotos sanitizados | Em Review |
| DAT-004 | P0 | Implementar ledger, checksum e lock de migracoes | L | REP-002 | Cada migracao executa uma vez, possui checksum, lock concorrente, estado e procedimento de rollback | Em Review |
| DAT-005 | P1 | Parametrizar SQL interpolado e limitar numericos | S | Nenhuma | `days`, `LIMIT` e valores dinamicos usam parametros/clamp; testes cobrem extremos e entradas invalidas | Em Review |
| DAT-006 | P1 | Avaliar criptografia/tokenizacao seletiva de PII | M | PRV-001, Topologia D4 | Threat model define campos; controle implementado ou risco residual formalmente aceito | Em Review |
| DAT-007 | P0 | Centralizar secrets, TLS e validacao de configuracao | L | GOV-003 | Sem credenciais conhecidas em deploy; secret manager; URLs/numericos/TLS validados; HTTP externo inseguro bloqueado | Bloqueado |

## AI - IA, Tools, Guardrails e Seguranca Clinica

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| AI-001 | P0 | Criar schema runtime estrito para cada tool | L | Nenhuma | Zod valida tipos, UUIDs, enums, datas, tamanhos e limites depois do modelo; argumentos invalidos nao chegam ao repositorio | Em Review |
| AI-002 | P0 | Autorizar e confirmar tools com efeito externo | L | AI-001, IAM-004, TEN-004 | Ownership/tenant por acao; reserva, cancelamento, publicacao e notificacao exigem pre-condicoes e retorno deterministico | Em Review |
| AI-003 | P0 | Criar suite clinica e adversarial | L | Operacao hospitalar | Dataset cobre diagnostico, prescricao, prognostico, emergencia, parafrase, jailbreak, exfiltracao e tool injection; thresholds aprovados | Em Review |
| AI-004 | P1 | Substituir confianca fixa por sinal baseado em evidencia | M | AI-003 | Confianca considera retrieval/tool/resultados; baixa evidencia aciona fallback; calibracao medida no dataset | Em Review |
| AI-005 | P0 | Responder ou realizar handoff em input bloqueado/baixa confianca | M | AI-003 | Nenhuma mensagem valida some silenciosamente; resposta segura ou handoff e registrado e testado | Em Review |
| AI-006 | P2 | Consolidar roteamento OpenAI/OpenRouter/RAG e modulos legados | L | PRV-005, REP-005 | Um contrato ativo por responsabilidade; fallback nao amplia dados; modulos sem consumidor sao removidos/arquivados | Em Review |

## REL - Confiabilidade, Filas e Runtime

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| REL-001 | P0 | Corrigir vazamento de transports/listeners do logger | S | Nenhuma | `child()` usa logger nativo; teste cria milhares de children sem crescer listeners/transports | Em Review |
| REL-002 | P0 | Implementar graceful shutdown completo | M | Nenhuma | HTTP para de aceitar; jobs drenam/retornam; Redis e pool PostgreSQL fecham; timeout forcado e testado | Em Review |
| REL-003 | P0 | Implementar leasing/visibility timeout por worker | L | WHK-003, DAT-002 | Replica nao recupera job ativo de outra; lease possui owner/heartbeat; crash recovery testado | Em Review |
| REL-004 | P0 | Corrigir retry, requeue e idempotencia entre replicas | M | REL-003 | Delay e atomico; retry nao fica visivel cedo; efeitos externos nao duplicam sob concorrencia/restart | Em Review |
| REL-005 | P1 | Separar liveness local de readiness | M | Nenhuma | Liveness nao chama SaaS nem revela detalhes; readiness cacheada e restrita; timeouts do orquestrador coerentes | Em Review |
| REL-006 | P1 | Endurecer startup e configuracao operacional | M | DAT-007 | Numericos/URLs/secrets obrigatorios validados; falhas geram mensagens sanitizadas e fail-fast | Em Review |
| REL-007 | P1 | Preservar correlation ID de HTTP ate worker e resposta | S | Nenhuma | Mesmo ID aparece no enqueue, claim, runtime, Chatwoot, audit e metricas | Em Review |

## OBS - Logs, Metricas, Alertas e Auditoria

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| OBS-001 | P0 | Implementar redacao recursiva e perfil seguro de producao | M | PRV-001 | Objetos, bindings e erros sanitizados; nomes, enderecos, conteudo clinico e stacks sensiveis nao aparecem; `pino-pretty` colorido fica desativado em producao | Em Review |
| OBS-002 | P1 | Exportar metricas completas para backend externo | L | Topologia D4 | Counters, gauges e histogramas agregam replicas, sobrevivem a restart e possuem dashboards | Em Review |
| OBS-003 | P1 | Criar alertas e SLOs operacionais | M | OBS-002 | Alertas de queue age, DLQ, erro, latencia, handoff e dependencias testados; owner e runbook vinculados | Em Review |
| OBS-004 | P0 | Tornar auditoria critica duravel e nao forjavel | L | IAM-003, DAT-004 | Evento participa da transacao/outbox; falha impede/compensa operacao critica; storage e ator verificados | Em Review |

## TST - Testes, E2E e Evidencias

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| TST-001 | P0 | Substituir testes que codificam auth e assinatura inseguras | M | IAM-002, WHK-002 | Testes exigem claims assinadas, role server-side, timestamp e fail-closed | Em Review |
| TST-002 | P0 | Automatizar avaliacoes clinicas e prompt/tool injection | L | AI-003 | Suite deterministica roda no CI; thresholds e casos de regressao versionados | Em Review |
| TST-003 | P1 | Cobrir todos os modulos TypeScript elegiveis | M | CICD-002 | `coverage.include` explicito; relatorio lista todos os arquivos; excecoes justificadas | Em Review |
| TST-004 | P1 | Testar `app.ts`, `server.ts`, health e shutdown | M | REL-002, REL-005 | Start/stop, sinais, timeouts e rotas de health cobertos sem exclusoes artificiais | Em Review |
| TST-005 | P1 | Criar integracao real com Postgres, Redis e Qdrant | L | DAT-001, DAT-002, DAT-003, DAT-004 | CI sobe stores reais; migrations, repositories, filas, tenant e recovery passam | Em Review |
| TST-006 | P0 | Executar E2E real Chatwoot/WhatsApp em staging | L | Gates G1-G4, ambiente externo | Fluxo completo e cenarios obrigatorios do roadmap possuem timestamps, IDs e evidencias | Bloqueado |
| TST-007 | P1 | Testar carga, concorrencia, restart, rollback e restore | L | REL-003, SUP-003 | SLOs, duplicacao, perda, RPO/RTO e rollback medidos e aprovados | Em Review |

## CICD - CI/CD e Release Gates

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| CICD-001 | P0 | Alinhar CI com a branch default | XS | REP-001 | Push/PR na branch default dispara workflow; branch protection exige checks | Em Review |
| CICD-002 | P0 | Tornar lint, typecheck, testes, cobertura, build e audit gates obrigatorios | M | CICD-001 | Merge bloqueado quando qualquer gate falha; thresholds de 80% linhas/70% branches | Em Review |
| CICD-003 | P0 | Alinhar versao Node entre package, CI e Docker | S | Nenhuma | Engine compativel com Vitest; mesma major em local documentado, CI e imagem | Em Review |
| CICD-004 | P1 | Incluir typecheck de testes e configuracoes | S | CICD-003 | `tests` nao excluidos pelo TypeScript; erros de tipo em testes bloqueiam merge | Em Review |
| CICD-005 | P1 | Criar gates de migracao, smoke e rollback | L | DAT-004, TST-005 | Migra/valida/rollback em banco descartavel; compose/build/smoke executam antes de release | Em Review |

## SUP - Dependencias e Supply Chain

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| SUP-001 | P0 | Corrigir vulnerabilidade de producao em `body-parser` | S | Nenhuma | `npm audit --omit=dev` nao reporta o advisory; testes de parsing continuam verdes | Em Review |
| SUP-002 | P1 | Tratar vulnerabilidades de desenvolvimento e politica de updates | M | CICD-002 | Audit completo sem high nao aceito; atualizacoes automatizadas agrupadas e revisadas | Em Review |
| SUP-003 | P1 | Fixar imagens por digest, gerar SBOM e escanear imagem | M | CICD-002 | Docker bases/servicos pinados; SBOM anexada; scan bloqueia high/critical sem aceite | Em Review |

## DOC - Documentacao e Operacao

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Status |
|---|---:|---|---:|---|---|---|
| DOC-001 | P1 | Definir fonte unica da verdade e arquivar status contraditorios | M | GOV-004 | Documento atual aponta para status autoritativo; historicos marcados; sem prioridades conflitantes | Em Review |
| DOC-002 | P1 | Atualizar README, indices, env vars e onboarding | M | Gates G1-G4 | README representa arquitetura real; docs 63-66 indexados; setup limpo reproduzido por outra pessoa | Em Review |
| DOC-003 | P1 | Atualizar runbooks de seguranca, privacidade, restore e incidente | L | PRV, DAT, REL, OBS concluidos | Operacao executa deploy, rollback, eliminacao, restore e incidente sem depender do autor | Em Review |
| DOC-004 | P1 | Registrar ADRs de tenant, auth, webhook, IA e topologia | M | GOV-003 | Decisoes, alternativas, consequencias e plano de migracao versionados | Em Review |

## Mapa de Rastreabilidade da Auditoria

| Achado do documento 63 | Itens que resolvem o achado |
|---|---|
| Papel e identidade autodeclarados | IAM-001, IAM-002, IAM-004, TST-001 |
| Ator de auditoria forjavel e falha ignorada | IAM-003, OBS-004 |
| Conta Chatwoot nao validada | TEN-001, TEN-002, WHK-001 |
| Ausencia de isolamento multi-tenant | TEN-004, DAT-001, TST-005 |
| Fallback de contato por nome | TEN-003, TST-001 |
| Assinatura fail-open e replay | WHK-002, WHK-003, TST-001 |
| Contrato Chatwoot nao comprovado | WHK-001, TST-006 |
| Rate limit contornavel e parser antecipado | WHK-005, WHK-006 |
| Schema permissivo e payload excessivo | WHK-004, PRV-003 |
| Redis sem AUTH/TLS | DAT-002, DAT-007 |
| DLQ e payload bruto sem lifecycle | PRV-002, PRV-003 |
| Postgres superuser e transporte fraco | DAT-001, DAT-007 |
| PII sem retencao/eliminacao | PRV-001, PRV-002, PRV-004 |
| Dados excessivos enviados a IA | PRV-005, PRV-006, AI-006 |
| Logs com PII e redacao superficial | OBS-001, PRV-001 |
| `pino-pretty` colorido no perfil de producao | OBS-001 |
| Qdrant sem TLS/key obrigatorios | DAT-003, DAT-007 |
| Tools sem validacao runtime completa | AI-001, AI-002, TST-002 |
| Guardrails baseados principalmente em regex | AI-003, TST-002 |
| Confianca fixa em 0,8 | AI-004 |
| Input bloqueado pode sumir silenciosamente | AI-005 |
| SQL dinamico interpolado | DAT-005 |
| Logger cria transports/listeners | REL-001 |
| Shutdown nao fecha HTTP/Postgres | REL-002, TST-004 |
| Worker rouba/reexecuta jobs entre replicas | REL-003, REL-004, TST-007 |
| Health/readiness caros e publicos | REL-005, TST-004 |
| Configuracao parcial e casts inseguros | REL-006, DAT-007 |
| Correlation ID perdido na fila | REL-007 |
| Metricas incompletas e locais | OBS-002, OBS-003 |
| CI nao executa na branch atual | CICD-001 |
| Coverage gate vermelho e modulos invisiveis | CICD-002, TST-003, TST-004 |
| Testes sem stores reais | TST-005 |
| Testes fora do typecheck | CICD-004 |
| Contrato Node inconsistente | CICD-003 |
| Dependencias vulneraveis | SUP-001, SUP-002 |
| Imagens sem digest/SBOM | SUP-003 |
| Migracoes sem ledger/checksum | DAT-004, CICD-005 |
| `dist` divergente e backups no repositorio | REP-003 |
| Arquivos centrais nao rastreados | REP-001, REP-002 |
| Arquivos grandes e duplicacao de modulos | REP-004, REP-005, AI-006 |
| Documentacao contraditoria e desatualizada | DOC-001, DOC-002, DOC-004 |
| Runbooks sem controles novos | DOC-003 |
| Ausencia de E2E real | TST-006 |
| Ausencia de carga, rollback e restore comprovados | TST-007, CICD-005, DOC-003 |

## Ordem Inicial Recomendada

Primeiros itens a iniciar:

```text
GOV-001 -> GOV-002 -> GOV-003
REP-001 -> REP-002
CICD-001 -> CICD-003
IAM-001
WHK-001
PRV-001
REL-001
SUP-001
```

Depois das decisoes D1-D4:

```text
IAM-002..004
TEN-001..004
WHK-002..006
PRV-002..006
DAT-001..007
```

## Itens que Bloqueiam Dados Reais

O sistema nao deve receber dados reais fora de ambiente controlado enquanto qualquer item abaixo estiver aberto:

```text
IAM-001 IAM-002 IAM-003 IAM-004
TEN-001 TEN-002 TEN-003 TEN-004
WHK-001 WHK-002 WHK-003 WHK-004 WHK-005
PRV-001 PRV-002 PRV-003 PRV-004 PRV-005 PRV-006
DAT-001 DAT-002 DAT-004 DAT-007
AI-001 AI-002 AI-003 AI-005
REL-001 REL-002 REL-003 REL-004
OBS-001 OBS-004
TST-001 TST-002
CICD-001 CICD-002 CICD-003
SUP-001
```

## Evidencias Esperadas por Categoria

| Categoria | Evidencia minima |
|---|---|
| Auth/RBAC | Tokens positivos/negativos, matriz de permissoes e logs de ator verificado |
| Webhook | Payload real, assinatura, timestamp, conta, replay e idempotencia |
| Tenant/contato | Testes cross-tenant e dois contatos homonimos sem mistura |
| Privacidade | Inventario, politica, dry-run/expurgo, eliminacao e comprovante |
| Stores | Roles/permissoes, TLS, rotacao, migration ledger e restore |
| IA/tools | Dataset, resultados, argumentos invalidos, ownership e confirmacao |
| Runtime | Restart, concorrencia, shutdown, queue age e ausencia de duplicacao |
| Observabilidade | Dashboards, alertas disparados e amostra de logs sem PII |
| CI/CD | Workflow verde em checkout limpo e merge bloqueado por falha |
| E2E | IDs correlacionados do WhatsApp ao Chatwoot e de volta |

## Fechamento do Backlog

O programa somente pode ser encerrado quando:

- todos os P0 estiverem `Concluido`;
- todo P1 estiver concluido ou possuir aceite formal de risco;
- os Gates G0-G5 estiverem aprovados;
- a reauditoria atingir os criterios do plano executivo;
- o E2E externo estiver comprovado;
- operacao, seguranca, privacidade e sponsor aprovarem o go-live.

## Referencias

- `docs/63_current_project_code_audit.md`
- `docs/64_executive_remediation_plan.md`
- `docs/65_remediation_roadmap.md`

*Backlog registrado em 2026-08-02.*
