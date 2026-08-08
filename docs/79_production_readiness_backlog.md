# 79 - Backlog de Prontidao para Producao

## Objetivo

Manter a lista operacional para resolver todos os bloqueadores e melhorias do documento 76 e executar os gates do documento 78.

Este backlog e a fonte de status do ciclo atual. O documento 66 permanece como historico da remediacao anterior; nenhum item deste documento deve ser considerado concluido sem evidencia e revisao independente.

## Status atual em 2026-08-08

| Estado | Quantidade atual | Regra |
|---|---:|---|
| A Fazer | 4 | Trabalho ainda nao iniciado ou sem evidencia suficiente |
| Bloqueado | 7 | Depende de ambiente, DPO, fornecedor ou aprovador externo |
| Em Andamento | 0 | Nenhum item possui execucao ativa registrada |
| Em Review | 31 | Implementacao local e testes existem, mas falta aceite/evidencia proporcional |
| Concluido | 0 | Exige criterio de aceite completo, revisao e evidencia externa quando aplicavel |

O status foi atualizado depois do ciclo de implementacao local. A evidencia
tecnica disponivel nesta data e: `npm test` com 959 testes aprovados e 12
ignorados em 114 arquivos aprovados e 4 ignorados, `npm run typecheck`,
`npm run lint`, `npm run build`, `npm audit` e `git diff --check` aprovados.
O scanner de artefatos e a imagem de producao tambem passaram sem
vulnerabilidades. O gate de
confiabilidade descartavel tambem passou com
migrations idempotentes, 500 jobs concorrentes sem perda ou duplicacao,
recovery de 25 leases apos restart do Redis e restores de PostgreSQL/Qdrant
sem perda. O `promtool` nao esta instalado localmente e deve ser executado no
CI. Isso nao equivale a homologacao de Chatwoot/EvolutionAPI, revisao
independente, aprovacao de privacidade ou go-live.

A ultima rodada adicionou a migration idempotente
`20260816_delivery_state_actors.sql`, que conserva `last_actor` nos estados de
inbound e response outbox, exibe correlation/IDs/estado/ator nas rotas
operacionais e impede que retry de uma mensagem ja presente duplique a lista
auxiliar do Redis. Esses controles permanecem `Em Review` ate revisao
independente e evidencia no ambiente alvo.

Neste ciclo tambem foram adicionados: preservacao do marcador de idempotencia
no formato flat do webhook Chatwoot; confirmacao de que a mensagem encontrada
no Chatwoot e publica e incoming antes do turno quando o modo estrito esta
ativo; smoke opcional que consulta uma mensagem real e aguarda a resposta
marcada; scanner de CPF/CNPJ/e-mail/telefone em artefatos; validacao de TLS
para o Chatwoot e identidade `X-Chatwoot-Delivery`; logs de smoke sem corpos
brutos; e regressao adversarial/baixa confianca reexecutada. Esses controles permanecem em
`Em Review` porque ainda precisam de evidencia no staging e aprovacao
independente quando o criterio do item exige isso.

## Prioridades

| Prioridade | Significado |
|---|---|
| P0 | Bloqueia dados reais, integridade de entrega, seguranca, privacidade ou go-live |
| P1 | Necessario antes de escalar ou operar sem supervisao intensiva |
| P2 | Melhoria de sustentabilidade, calibracao e reducao de risco futuro |

## Definicao de pronto

Todo item concluido deve possuir:

- owner e aprovador registrados;
- PR ou commit rastreavel;
- teste automatizado proporcional ao risco;
- typecheck, lint, testes e build aplicaveis aprovados;
- evidencias do criterio de aceite;
- migration e rollback testados quando aplicavel;
- revisao independente para P0/P1;
- runbook/documentacao atualizados;
- risco residual fechado ou aceito formalmente.

## GOV - Governanca e decisoes

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| GOV-001 | P0 | Congelar atendimento autonomo real e restringir staging a dados sinteticos | XS | Nenhuma | Decisao registrada; uma inbox de teste; uma replica; canal de incidente | Sponsor/Operacao | A Fazer |
| GOV-002 | P0 | Nomear owners e aprovadores de tecnologia, security, privacy, SRE, QA e operacao | XS | GOV-001 | Risk register com owner, prazo e aprovador por risco | Sponsor | A Fazer |
| GOV-003 | P0 | Aprovar ADR de semantica de entrega, estado de handoff e confirmacao Chatwoot | S | GOV-002 | ADR define chave de idempotencia, fonte de verdade e criterio para `message_created` | Tech Lead | Em Review |
| GOV-004 | P1 | Consolidar branch/PR e ativar revisao independente e branch protection | S | GOV-002 | `CODEOWNERS` e template de PR preparados; checkout reproduzivel; PR P0/P1 revisado; checks obrigatorios ativos | Tech Lead/QA | A Fazer |

## OUT - Inbox, outbox e efeitos externos

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| OUT-001 | P0 | Criar receipt/inbox duravel para webhook inbound | M | GOV-003 | Evento possui tenant, account, conversation, message, correlation, payload minimo, estado e timestamps; chave unica rejeita replay apos restart/TTL | Backend | Em Review |
| OUT-002 | P0 | Criar response intent/outbox ligado ao turno inbound | L | OUT-001, GOV-003 | Uma chave logica por conversa/mensagem/turno; estados `pending`, `sending`, `sent`, `unknown`, `failed`, `reconciled` persistidos | Backend | Em Review |
| OUT-003 | P0 | Implementar adapter Chatwoot com envio seguro e reconciliacao | L | OUT-002, WHK-001 | Timeout, retry e consulta/reconciliacao cobertos; estado `unknown` nunca gera novo POST sem decisao registrada | Backend | Em Review |
| OUT-004 | P0 | Testar crash depois da aceitacao do Chatwoot e antes do retorno local | M | OUT-003 | Nenhuma resposta duplicada em crash, timeout, restart e retry; evidencia com IDs Chatwoot | QA/Backend | Em Review |
| OUT-005 | P1 | Tornar idempotentes labels, notas e outras acoes externas de handoff | M | OUT-002, HOF-002 | Reexecucao produz um unico efeito logico e registra reconciliacao | Backend | Em Review |
| OUT-006 | P1 | Remover ou limitar deduplicacao por conteudo e preservar ordem original | S | OUT-001 | Mensagens diferentes com mesmo texto sao processadas; duplicidade real usa ID/evento e `created_at` Chatwoot | Backend/QA | Em Review |

## REL - Fila, concorrencia e recuperacao

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| REL-001 | P0 | Implementar ordenacao/coalescing por conversa e espera controlada pelo lock | L | OUT-001 | Mensagens concorrentes da mesma conversa aguardam ou coalescem; nenhuma mensagem valida vai a DLQ apenas por lock ocupado | Backend | Em Review |
| REL-002 | P1 | Renovar lock de conversa com fencing/owner seguro | M | REL-001 | Lock nao expira durante turno ativo; owner antigo nao pode liberar ou finalizar turno novo | Backend | Em Review |
| REL-003 | P1 | Classificar erros e aplicar retry/backoff/max-age por tipo | M | OUT-003, REL-001 | Falhas transitorias tentam novamente; falhas permanentes vao para DLQ; cada descarte gera alerta e receipt | Backend/SRE | Em Review |
| REL-004 | P0 | Criar replay autenticado, auditado e minimizado da DLQ | M | REL-003, SEC-001 | Operador autorizado consegue listar, reprocessar, cancelar e justificar job; replay nao duplica efeito externo | Backend/Security/SRE | Em Review |

## HOF - Handoff e estado da conversa

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| HOF-001 | P0 | Tornar PostgreSQL a fonte de verdade do estado de automacao/handoff | L | GOV-003, OUT-001 | Estado ativo, expiracao, motivo, owner humano e versao ficam persistidos e tenant-aware | Backend | Em Review |
| HOF-002 | P0 | Implementar transicao idempotente de handoff e bloqueio antes do turno | L | HOF-001, OUT-005 | Handoff ativo impede processamento mesmo com Redis vazio; transicoes concorrentes sao seguras | Backend | Em Review |
| HOF-003 | P1 | Implementar resolucao, expiracao e retomada controlada do handoff | M | HOF-002 | Somente operador/autorizacao definida retoma automacao; expiracao cancela pendencia e gera auditoria | Backend/Operacao | Em Review |
| HOF-004 | P1 | Corrigir telemetria de handoff parcial ou falho | S | HOF-002, OBS-003 | `handoff_triggered` so e sucesso quando efeitos exigidos foram reconciliados; falhas possuem estado explicito | Backend/QA | Em Review |

## CTX - Contexto e reidratacao

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| CTX-001 | P1 | Reidratar historico e estado a partir do PostgreSQL/Chatwoot apos perda do Redis | L | HOF-001, OUT-001 | Restart/perda do Redis preserva contexto, intake, handoff e ultima mensagem necessaria ao turno | Backend | Em Review |
| CTX-002 | P1 | Definir limites, ordenacao e versionamento do contexto | M | CTX-001, OUT-006 | Historico limitado sem perder mensagens recentes; timestamps originais; conflito de versao detectado | Backend/QA | Em Review |
| CTX-003 | P1 | Retirar o estado de agendamento da dependencia autoritativa do Redis | M | CTX-001, HOF-001 | `conversation_scheduling_state` tenant-aware, migration/rollback, cache best-effort, migracao de legado e privacy export/anonymize/erase cobertos | Backend/Privacy/QA | Em Review |

## WHK - Contrato e entrada Chatwoot

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| WHK-001 | P0 | Capturar e aprovar contrato real do Chatwoot/Agent Bot | M | GOV-003 | Headers, corpo bruto, assinatura, timestamp, account, inbox, message e status documentados com evidencia de staging | Integracao/QA | Bloqueado |
| WHK-002 | P0 | Decidir e implementar confirmacao independente da mensagem | M | WHK-001 | Ou existe `GET`/reconciliacao por `chatwootMessageId`, ou ADR aprova webhook assinado como evidencia suficiente e testa o contrato real | Backend/Tech Lead | Bloqueado |
| WHK-003 | P1 | Fortalecer event ID, timestamp original, source policy e rate limit | M | WHK-001, OUT-001 | Replay apos TTL, account/inbox divergente, proxy e carga alta sao rejeitados ou tratados com evidencia | Backend/Security | Em Review |

## PRV - Privacidade e ciclo de vida

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| PRV-001 | P0 | Aprovar inventario, finalidade, retencao, legal hold, DPA e fornecedores | M | GOV-002 | DPO/owner hospitalar aprovam documentos 67-69, OpenAI/OpenRouter, Chatwoot, Qdrant e logs | Privacy/DPO | Bloqueado |
| PRV-002 | P0 | Automatizar expurgo auditavel de queue, DLQ, contexto, logs e dados vencidos | L | PRV-001, OUT-001 | Dry-run, TTL, purge, metricas, auditoria e rollback; nenhum payload fica indefinidamente sem policy | Backend/SRE/Privacy | Em Review |
| PRV-003 | P0 | Habilitar e testar privacidade, chaves e eliminacao E2E | L | PRV-001, SEC-001 | Checkpoints, key ring, backfill, exportacao, anonimizacao e erase passam no ambiente alvo | Security/Privacy/SRE | Bloqueado |

## SEC - Secrets, transporte e minimizacao

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| SEC-001 | P0 | Provisionar secret manager, TLS, ACL e rede privada comprovada | M | GOV-002, PRV-001 | DATABASE, Redis, Qdrant e Chatwoot usam credenciais rotacionaveis; excecao insecure removida do perfil padrao | SRE/Security | Bloqueado |
| SEC-002 | P1 | Validar minimizacao e ausencia de PII em logs/Qdrant/provedores | M | PRV-001, SEC-001 | Amostras reais de staging passam scan; atestacoes e limites de dados ficam arquivados | Security/Privacy/QA | Em Review |

## OBS - Readiness, metricas e resposta

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| OBS-001 | P1 | Ampliar readiness sem confundir liveness e capacidade do worker | M | REL-001, SEC-001 | Readiness cobre Redis, PostgreSQL, fila/worker e dependencias necessarias; liveness permanece barato | SRE/Backend | Em Review |
| OBS-002 | P1 | Provisionar metricas externas, dashboards, alertas e on-call | L | GOV-002, SEC-001 | Queue age, retry, DLQ, duplicate, unknown send, handoff, provider e SLO alertam com owner | SRE/Operacao | Em Review |
| OBS-003 | P1 | Criar auditoria e telemetria de cada estado de entrega/handoff sem PII | M | OUT-002, HOF-001 | Correlation ID, event ID, response ID, estado e ator ficam consultaveis; conteudo sensivel nao aparece | Backend/Security | Em Review |

## E2E - Homologacao e evidencia

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| E2E-001 | P0 | Provisionar conta, inbox, numero WhatsApp e secrets de staging | M | GOV-001, WHK-001, SEC-001 | Ambiente isolado, dados sinteticos, conta de teste e rota EvolutionAPI/Chatwoot identificadas | Integracao/SRE | Bloqueado |
| E2E-002 | P0 | Executar matriz funcional completa | L | OUT-003, HOF-002, OBS-002, E2E-001 | Intake, RAG, agenda, handoff, emergencia, baixa confianca e resposta Chatwoot/WhatsApp aprovados | QA/Operacao | Em Review |
| E2E-003 | P0 | Executar matriz de duplicacao, timeout, restart e indisponibilidade | L | OUT-004, REL-004, E2E-001 | Zero duplicacao/perda; jobs unknown reconciliados; provider outage gera fallback/handoff seguro | QA/Backend/SRE | Em Review |
| E2E-004 | P1 | Executar carga, concorrencia, restore e rollback no staging alvo | L | E2E-002, E2E-003, OBS-002 | SLO, RPO, RTO, capacidade e rollback aprovados com evidencias versionadas | QA/SRE | Em Review |

## OPS - Runbook, piloto e decisao

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| OPS-001 | P1 | Atualizar runbooks de deploy, rollback, DLQ, incidente, restore e privacidade | M | REL-004, PRV-002, OBS-002 | Operador diferente do autor executa os procedimentos em staging | SRE/Operacao | Em Review |
| OPS-002 | P0 | Executar piloto supervisionado e ata de go/no-go | M | E2E-004, OPS-001 | Inbox limitada; periodo definido; amostra revisada; P0 zerado; ata assinada | Sponsor/Operacao | Bloqueado |

## AI - Qualidade e side effects

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| AI-001 | P1 | Reexecutar suite clinica/adversarial apos mudancas de retry e contexto | M | CTX-001, E2E-002 | Guardrails, baixa confianca, emergencia e prompt/tool injection mantem threshold aprovado | QA/Security/Operacao | Em Review |
| AI-002 | P1 | Testar idempotencia e ownership de tools mutaveis sob retry | M | OUT-004, REL-003 | Agenda, notificacao e handoff nao executam efeito duplicado nem cruzam conversa/contato | Backend/QA | Em Review |

## DOC - Consolidacao e revisao

| ID | Pri | Tarefa | Tam. | Dependencias | Criterio de aceite | Owner | Status |
|---|---:|---|---:|---|---|---|---|
| DOC-001 | P1 | Atualizar README, indices, documento 72 e runbooks com o novo ciclo | S | GOV-003, OPS-001 | Nao existem status conflitantes; documentos 76-79 aparecem como fonte atual do ciclo | Tech Lead | Em Review |
| DOC-002 | P0 | Realizar revisao independente P0/P1 e fechar risk register | M | Todos os P0/P1 | Revisor assina achados, evidencias e riscos aceitos; nenhum P0 fica sem owner | Tech Lead/Security/QA | A Fazer |

## Mapa de dependencias para execucao

```text
GOV-001..004
   |
   +--> OUT-001..006 --> REL-001..004
   |                         |
   +--> HOF-001..004 --> CTX-001..003
   |
   +--> WHK-001..003
   |
   +--> PRV-001..003 --> SEC-001..002 --> OBS-001..003
                                      |
                                      v
                         E2E-001..004 --> OPS-001..002
```

## Fechamento do backlog

O ciclo somente pode ser encerrado quando:

- todos os P0 estiverem `Concluido` ou formalmente aceitos;
- todo P1 estiver concluido ou possuir aceite formal de risco;
- G0-G6 estiverem aprovados;
- os testes E2E externos tiverem evidencias com IDs e timestamps;
- o piloto tiver operacao, seguranca, privacidade, QA e sponsor aprovando a decisao;
- o documento 72 estiver atualizado com a ata final.
