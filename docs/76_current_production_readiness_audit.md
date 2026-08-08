# 76 - Auditoria de Prontidao para Atendimento em Producao (baseline)

## Objetivo

Reavaliar o estado atual do `cvg-agent-secretary` depois das atualizacoes implementadas desde a auditoria do documento 63, verificando se o agente esta apto para atendimento de clientes em producao.

Esta auditoria concentra-se no fluxo real de atendimento:

- mensagem recebida pelo Chatwoot;
- validacao, deduplicacao e enfileiramento;
- processamento pelo worker;
- contexto, RAG, IA e ferramentas;
- handoff para humano;
- envio da resposta ao Chatwoot;
- recuperacao apos falhas, reinicio e repeticao de eventos.

## Escopo e fonte

| Campo | Valor |
|---|---|
| Repositorio | `ricardoakinaga-dev/cvg-agent-secretary` |
| Branch | `master` |
| Commit auditado | `aa3dc691c51c857f1cf206d8aef354bf6e460705` |
| Data da auditoria | 2026-08-07 |
| Estado do checkout antes deste relatorio | limpo e igual a `origin/master` |
| Evidencia remota | commit `aa3dc69` publicado no repositorio GitHub |

Esta auditoria complementa os documentos 72, 73 e 74. O documento 72 continua sendo a fonte autoritativa para a decisao executiva de go/no-go.

## Nota de atualizacao do ciclo seguinte

Este documento registra o snapshot auditado em 2026-08-07, antes do ciclo de
implementacao local iniciado em 2026-08-08. Os achados internos de inbox,
outbox, reconciliacao, lock/lease, estado duravel de handoff, reidratacao,
replay de DLQ, claims de tools e manutencao de privacidade foram tratados na
arvore local e estao rastreados no documento 79 como `Em Review`, nao como
`Concluido`. A suite local do ciclo auditado anterior passou com 910 testes
aprovados e 12 ignorados, mas a evidencia externa continua ausente. Portanto,
as secoes de achados abaixo sao a baseline que motivou o plano 77; o status
operacional atual deve ser lido no backlog 79.

## Snapshot tecnico posterior - 2026-08-08

Depois da baseline acima, foi executado um ciclo local de remediacao. Foram
implementados e testados, entre outros controles:

- receipt duravel de inbound, lease, retry, DLQ e recuperacao apos restart;
- response intent/outbox com estados `pending`, `sending`, `sent`, `unknown`,
  `failed` e `reconciled`;
- envio Chatwoot idempotente, confirmacao por mensagem/marcador e
  reconciliacao administrativa sem retry cego;
- handoff persistente e fail-closed, com transicao otimista, expiracao e
  reconciliacao de labels/notas;
- lock renovavel, claims duraveis de tools, idempotencia de agendamentos e
  reidratacao do estado principal fora do Redis, incluindo estado duravel de
  agendamento em PostgreSQL com Redis apenas como cache;
- replay autenticado de DLQ, metricas/alertas, readiness e validacao de
  configuracao de go-live;
- minimizacao de PII em payloads persistidos, auditoria, analytics e erros.
- preservacao do marcador `cvg_idempotency_key` tambem no formato flat do
  webhook Chatwoot;
- confirmacao opcional/obrigatoria conforme ambiente de que a mensagem existe
  no Chatwoot e e publica/incoming antes do turno;
- smoke de staging capaz de consultar um `chatwootMessageId` real e aguardar a
  resposta externa marcada;
- scanner de CPF, CNPJ, e-mail e telefone em artefatos exportados, sem
  imprimir o valor encontrado;
- ordenacao duravel por timestamp original da mensagem e espera controlada
  sem consumir tentativa enquanto existe receipt anterior ativo;
- classificacao explicita de falhas permanentes, transitorias e de contencao,
  com classe registrada na DLQ e backoff limitado;
- limite de 50 mensagens no contexto apos cada mutacao, preservando a
  contagem total e a ordenacao temporal;
- correlation ID persistido no response outbox e no caminho de handoff;
- estado de reagendamento persistido como `waiting_slot_confirmation` apos
  uma nova reserva bem-sucedida;
- retry de uma mensagem ja persistida nao duplica a lista auxiliar do Redis;
- `last_actor` duravel em inbound receipt e response outbox, com correlation,
  IDs, estado e ator expostos nas consultas operacionais sem conteudo sensivel;
- regressao clínica/adversarial reexecutada, incluindo baixa confianca.

As evidencias reproduzidas no checkout local foram: `npm test` com 959 testes
aprovados e 12 ignorados em 114 arquivos aprovados e 4 ignorados, typecheck,
lint, build, `npm audit` completo e `git diff --check` aprovados, mais o gate
de confiabilidade descartavel com migrations idempotentes, concorrencia de 500
jobs, zero perda, zero execucao duplicada, recuperacao de 25 leases apos
restart do Redis e restore de PostgreSQL/Qdrant sem perda; 17 migrations foram
aplicadas e reaplicadas sem duplicacao. A imagem de
producao tambem foi reconstruida com zero vulnerabilidades nas camadas builder
e final. O `promtool` nao esta instalado neste ambiente; a validacao semantica
das regras Prometheus continua pendente no CI.

O ciclo tambem passou a usar `X-Chatwoot-Delivery` quando o provedor o envia,
falha fechado para `CHATWOOT_API_URL` sem TLS em producao e detalhes de smoke
sem corpos de resposta de provedores. Essas protecoes sao locais; ainda falta
validar o contrato e a topologia reais do ambiente alvo.

Esse snapshot melhora o estado interno do programa, mas nao substitui a
homologacao externa. Permanecem bloqueadores para atendimento real: contrato
e E2E Chatwoot/EvolutionAPI/WhatsApp, secrets/TLS/rede do ambiente alvo,
aprovacao de privacidade/DPA/retencao, provisionamento de observabilidade e
revisao independente P0/P1. O veredito continua **NO-GO**.

### Estado atual dos achados da baseline

| Achado da baseline | Estado apos o ciclo local | Evidencia ainda necessaria |
|---|---|---|
| P0-01 entrega externa | Mitigado localmente por intent/outbox, marcador e reconciliacao | Crash/timeout no Chatwoot real e contrato externo aprovado |
| P0-02 E2E externo | Smoke preparado para confirmar inbound e resposta marcada | Execucao com Chatwoot, EvolutionAPI e WhatsApp reais |
| P0-03 handoff | Mitigado localmente com controle duravel, fencing otimista e fail-closed | Ensaio no ambiente alvo e revisao independente |
| P1-01 concorrencia | Mitigado localmente com espera, heartbeat e retry classificado | Carga/conversa concorrente no staging alvo |
| P1-02 Redis como fonte de estado | Mitigado localmente por reidratacao PostgreSQL + cache, incluindo scheduling state duravel | Restart/restore no ambiente alvo |
| P1-03 confirmacao da mensagem | Implementada sob `CHATWOOT_CONFIRM_INBOUND_MESSAGES=true` | Captura/aprovacao do contrato real |
| P1-04 readiness/deploy | Readiness cobre Redis, PostgreSQL e worker; liveness permanece barato | TLS, secrets, rede e `promtool` no CI |
| P0-04 retencao | Runtime automatico e scanner operacional preparados | DPO, checkpoints e stores reais aprovados |

## Resumo executivo

| Indicador | Resultado |
|---|---|
| Estado do codigo | Candidato de pre-producao |
| Atendimento autonomo com clientes reais | **NO-GO** |
| Homologacao controlada com dados sinteticos | Possivel |
| Fluxo assincrono Chatwoot -> worker | Implementado |
| Persistencia de conversa e mensagem inbound | Implementada |
| Idempotencia de envio externo | Implementada localmente; contrato Chatwoot real ainda nao homologado |
| Handoff persistente como fonte de verdade | Implementado localmente; reconciliacao externa ainda exige aceite |
| E2E real WhatsApp/Chatwoot/EvolutionAPI | Smoke preparado, execucao real ainda nao comprovada |

O projeto deixou de ser um esqueleto. Existe uma fundacao tecnica relevante, com webhook protegido, fila, worker, RAG, tools, guardrails, persistencia e testes. Ainda assim, a garantia necessaria para conversar com clientes reais nao esta fechada.

## Veredito

O agente ainda nao deve ser liberado para atendimento aberto ou autonomo de clientes.

Ele pode avancar para uma homologacao controlada com uma conta e inbox de teste, dados sinteticos, uma replica e supervisao humana. A liberacao para clientes reais exige o fechamento dos riscos de duplicacao de resposta, handoff, recuperacao do contexto e evidencia E2E externa.

## Fluxo atual encontrado

```text
Chatwoot message_created
        |
        v
HMAC + timestamp + conta/inbox + schema Zod
        |
        v
Redis queue com deduplicacao e lease
        |
        v
worker -> lock da conversa -> claim da mensagem
        |
        v
PostgreSQL + contexto Redis
        |
        v
intake -> intencao -> RAG -> IA/tools -> guardrails
        |
        v
POST de resposta no Chatwoot
        |
        v
persistencia local + marcadores de mensagem do bot
```

O webhook agora retorna `202` depois de enfileirar, sem aguardar IA ou resposta externa (`src/app.ts:263`).

## Evolucao em relacao ao diagnostico anterior

| Achado anterior | Estado atual | Avaliacao |
|---|---|---|
| Entrada nao passava pelo Chatwoot | Webhook assinado do Chatwoot e validado antes da fila | Corrigido no fluxo interno |
| Cada mensagem criava nova conversa | `upsert` usa `tenant_id` e `chatwoot_conversation_id` | Corrigido |
| Worker nao processava conversa real | Worker Redis processa eventos e despacha `message_created` | Corrigido estruturalmente |
| Inbound nao criava evento | Evento entra em fila com correlation ID, lease, retry e DLQ | Corrigido estruturalmente |
| Idempotencia dependia de SELECT + INSERT | `SET NX` atomico e `ON CONFLICT` no PostgreSQL | Corrigido para inbound |
| Webhook aguardava IA | Endpoint responde `202` e o worker faz o processamento | Corrigido |
| Lock inexistente | Lock agora espera, renova lease e classifica contenção; carga do alvo ainda falta | Mitigado localmente |
| Handoff apenas por label/nota | Controle PostgreSQL, fencing otimista, expiracao fail-closed e reconciliacao foram adicionados | Mitigado localmente; aceite externo pendente |
| Mensagem deveria ser confirmada no Chatwoot | Worker consulta o ID quando `CHATWOOT_CONFIRM_INBOUND_MESSAGES=true` e exige mensagem publica/incoming | Implementado localmente; contrato real pendente |
| Resposta nao tinha rastreio local | Inbound receipt, response outbox, marcador e reconciliacao foram adicionados | Mitigado localmente; crash no Chatwoot real pendente |

## Achados criticos da baseline

Os itens abaixo preservam o diagnostico original para rastreabilidade. O
estado posterior e a evidencia disponivel devem ser lidos nas tabelas de
atualizacao e na secao de verificacoes ao final.

### P0-01 - Envio ao Chatwoot nao e idempotente de forma duravel

`sendBotMessage()` grava um marcador no Redis, faz o `POST` para o Chatwoot, salva a mensagem no PostgreSQL e somente depois grava o ID enviado (`src/modules/runtime/messageDelivery.ts:10`).

Se o Chatwoot aceitar a mensagem e o processo cair antes da persistencia ou do marcador final, o retry do worker podera enviar uma segunda resposta. O mesmo ocorre se a resposta do Chatwoot for aceita, mas a conexao falhar antes de o agente receber o retorno.

O cliente Chatwoot nao envia uma chave de idempotencia nem consulta uma intencao de envio existente (`src/modules/chatwoot/client.ts:26`). O outbox de auditoria existente nao resolve esse efeito externo.

Impacto: o cliente pode receber respostas duplicadas, contrariando o requisito de que uma mensagem inbound gere no maximo uma resposta automatica.

### P0-02 - Nao existe evidencia E2E externa suficiente para liberar clientes

O smoke atual verifica health, readiness e o aceite HTTP do webhook assinado (`src/modules/readiness/stagingSmoke.ts:141`). Ele nao aguarda o processamento do worker, nao confirma a mensagem criada no Chatwoot e nao verifica a entrega final pelo WhatsApp.

A suite automatizada da baseline validava o comportamento com mocks. Naquela verificacao, 101 arquivos passaram e 4 foram ignorados; 882 testes passaram e 12 foram ignorados. O snapshot posterior deste documento registra 959 testes aprovados. Isso e uma evidencia forte de regressao de codigo, mas nao substitui uma mensagem real passando por Chatwoot, EvolutionAPI e WhatsApp.

O contrato real do webhook, a conta, a inbox, o numero de teste e as falhas de terceiros precisam ser comprovados no ambiente de staging.

### P0-03 - Handoff nao possui uma fonte de verdade duravel no runtime

O handoff e registrado no PostgreSQL, mas `shouldProcessConversation()` decide apenas a partir do estado carregado do Redis (`src/modules/conversations/contextLoader.ts:149`). O metodo `findByConversation()` do repositorio de handoff nao e consultado antes de processar uma nova mensagem.

O estado da conversa expira no Redis em 24 horas (`src/shared/redis.ts:548`). Se o Redis perder ou expirar o estado, o agente pode reconstruir a conversa como `new` e voltar a responder enquanto um atendente humano ja assumiu o caso.

A sequencia de handoff tambem nao e atomica: labels, nota no Chatwoot, registro no PostgreSQL e congelamento do estado podem falhar em momentos diferentes (`src/modules/runtime/operationalHandoff.ts:55`).

### P1-01 - Concorrencia pode mover mensagem legitima para a DLQ

O runtime falha imediatamente quando outra execucao possui o lock (`src/modules/runtime/agentRuntime.ts:105`). O worker tenta novamente cinco vezes com atraso fixo de um segundo (`src/modules/webhook/worker.ts:134`).

Se a primeira resposta demorar mais que essa janela, a segunda mensagem pode ser enviada para a DLQ em vez de aguardar a vez. O lock da conversa dura cinco minutos e nao possui heartbeat proprio (`src/shared/redis.ts:576`), portanto uma execucao excepcionalmente longa pode permitir sobreposicao.

### P1-02 - Historico e estado operacional ainda dependem do Redis

O PostgreSQL salva mensagens, mas o contexto usado pelo agente e carregado do Redis (`src/modules/conversations/contextLoader.ts:39`). O estado e as mensagens de contexto possuem TTL de 24 horas e limite de 50 mensagens (`src/shared/redis.ts:493`). O estado de agendamento era Redis-only na baseline; no ciclo atual foi movido para `conversation_scheduling_state`, com cache Redis e migracao de compatibilidade apenas quando um legado e encontrado.

Nao existe reidratacao completa do contexto a partir do PostgreSQL ou do historico do Chatwoot apos perda do Redis. A persistencia local, portanto, ainda nao funciona como fonte de recuperacao do turno do agente.

### P1-03 - A confirmacao independente da existencia da mensagem ainda nao esta implementada

A assinatura HMAC, o timestamp e o vinculo de conta/inbox tornam o evento `message_created` uma evidencia forte de origem Chatwoot (`src/middleware/chatwoot-signature.ts:72`). No ciclo atual o worker pode confirmar o `chatwootMessageId` no Chatwoot e exige mensagem publica/incoming quando o modo estrito esta ativo. A captura e aprovacao do contrato real continuam pendentes.

Se a regra de negocio exigir que a Secretary consulte o Chatwoot antes de processar, esse criterio ainda esta pendente. Se o webhook assinado for aceito como confirmacao suficiente, o requisito esta atendido pelo caminho normal, mas deve ser registrado formalmente.

### P1-04 - Readiness e deploy nao comprovam todas as dependencias

`/ready` verifica somente Redis e PostgreSQL (`src/app.ts:322`). Chatwoot, OpenAI/OpenRouter, Qdrant, worker e capacidade da fila nao fazem parte do readiness efetivo.

O Compose de producao define `ALLOW_INSECURE_PRIVATE_STORES=true` e usa URLs sem TLS para stores internos (`docker-compose.yml:119`). Essa excecao somente e aceitavel se a rede privada, ACL, isolamento e controle de acesso forem comprovados no ambiente alvo.

### P0-04 - Retencao e expurgo operacional ainda dependem de procedimento manual

Existe uma API de privacidade com preview, purge, exportacao e anonimizacao, mas a execucao depende de autenticacao, policy, checkpoint e chamada operacional (`src/modules/privacy/routes.ts:79`). O Compose deixa `PRIVACY_ENABLED` desativado por padrao (`docker-compose.yml:147`) e nao existe um job automatico de expurgo do historico de conversas, contexto Redis ou DLQ no ciclo principal do servidor.

Para dados reais de clientes, a politica de retencao, os prazos, o legal hold, a eliminacao e os fornecedores externos precisam estar aprovados e operacionais antes do go-live.

## Controles atuais confirmados

- HMAC com corpo bruto, timestamp e janela de validade;
- validacao de conta e allowlist de inbox antes da fila;
- schema e limites de payload com Zod;
- fila Redis com lease, heartbeat, retry, expiracao e DLQ;
- `SET NX` para claims de mensagem e unicidade local por ID Chatwoot;
- `upsert` de conversa por identificador Chatwoot;
- PostgreSQL tenant-aware com RLS e FKs compostas;
- schemas estritos para tools, ownership de agenda e confirmacao da acao do usuario;
- guardrails clinicos, fallback e handoff;
- mascaramento de dados em logs e persistencia local;
- Docker com usuario nao-root, migrations e graceful shutdown;
- lint, typecheck, build e suite deterministica aprovados.

## Verificacoes reproduzidas

| Verificacao | Resultado |
|---|---|
| `npm run typecheck` | passou |
| `npm run lint` | passou |
| `npm run build` | passou |
| `npm test -- --reporter=dot` | 114 arquivos passaram; 4 ignorados |
| Testes totais | 959 passaram; 12 ignorados |
| Testes direcionados de Chatwoot/worker/lock/deduplicacao | 77 passaram no ultimo recorte |
| `git status` antes do salvamento deste relatorio | checkout limpo |
| Sincronizacao remota | `HEAD` igual a `origin/master` |

Os testes ignorados e os gates de confiabilidade nao equivalem a uma validacao real de Chatwoot, EvolutionAPI, WhatsApp e provedores externos.

## Condicoes minimas para liberar atendimento real

1. Implementar outbox ou registro duravel de intencao de envio, com idempotencia verificavel no Chatwoot e reconciliacao apos timeout ou restart.
2. Tornar o PostgreSQL a fonte de verdade do handoff e consultar o estado ativo antes de qualquer processamento.
3. Implementar espera/ordenacao por conversa, renovacao do lock, replay operacional da DLQ e teste de mensagens concorrentes.
4. Reidratar contexto e estado a partir do PostgreSQL ou Chatwoot apos perda do Redis.
5. Executar E2E real com numero WhatsApp de teste, incluindo duplicacao, restart, handoff, emergencia, timeout e indisponibilidade de Chatwoot/IA.
6. Aprovar retencao, eliminacao, DPA, secret manager, TLS, observabilidade, backup/restore, RPO/RTO e runbook de incidente.
7. Fazer piloto com uma inbox limitada, supervisao humana e criterio de rollback antes de ampliar o atendimento.

## Decisao final

```text
NO-GO para atendimento autonomo de clientes reais.
GO condicionado para homologacao controlada e staging com dados sinteticos.
```

A auditoria original nao alterou o codigo; as remediacoes posteriores estao
na arvore local e ainda nao foram publicadas. Este documento registra a
baseline e o snapshot tecnico posterior, e deve ser lido junto com
`docs/72_residual_risk_and_go_no_go.md`,
`docs/74_final_remediation_execution_report.md`,
`docs/77_executive_production_readiness_plan.md`,
`docs/78_production_readiness_roadmap.md` e
`docs/79_production_readiness_backlog.md`.
