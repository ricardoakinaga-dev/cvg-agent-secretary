# 77 - Plano Executivo para Prontidao de Producao

## Objetivo

Levar o `cvg-agent-secretary` do estado atual de **NO-GO para atendimento autonomo com clientes reais** para uma operacao controlada, segura, observavel e auditavel.

Este plano deriva do documento 76 e deve ser executado junto com:

- `docs/78_production_readiness_roadmap.md`;
- `docs/79_production_readiness_backlog.md`;
- `docs/72_residual_risk_and_go_no_go.md`;
- `docs/49_production_runbook.md`.

## Decisao executiva atual

```text
NO-GO para atendimento autonomo de clientes reais.
GO condicionado para staging e homologacao com dados sinteticos,
uma inbox de teste, uma replica e supervisao humana.
```

Nao deve haver rollout gradual para clientes enquanto existir qualquer P0 aberto, enquanto a resposta externa nao tiver semantica de entrega segura ou enquanto o E2E real nao estiver comprovado.

## Estado tecnico do ciclo em 2026-08-08

As remediacoes internas de entrega, concorrencia, handoff, contexto, tools,
privacidade operacional, DLQ, reconciliacao e observabilidade foram
implementadas na arvore local e estao em `Em Review` no backlog 79. O ciclo
tambem passou a preservar o marcador de idempotencia no formato flat do
webhook, confirmar mensagem publica/incoming no Chatwoot em modo estrito,
executar smoke opcional com mensagem real, manter o estado de agendamento no
PostgreSQL com cache Redis e escanear artefatos em busca de PII. A suite local
passou com 959 testes aprovados e 12 ignorados em 114 arquivos aprovados e 4
ignorados; typecheck, lint, build, `npm audit`, scanner de artefatos e
`git diff --check` tambem passaram. A imagem de producao foi reconstruida com
o lock corrigido e reportou zero vulnerabilidades nas camadas builder e final.
O gate de confiabilidade descartavel
comprovou migrations idempotentes, 500 jobs concorrentes sem perda ou
duplicacao, recuperacao de leases apos restart do Redis e restores de
PostgreSQL/Qdrant sem perda. O ciclo final tambem eliminou duplicacao na lista
auxiliar de contexto e tornou o ultimo ator de cada transicao de inbound e
outbox consultavel sem persistir o conteudo da conversa.

Isso fecha a parte de engenharia que podia ser verificada sem acessar
provedores externos. O programa ainda permanece **NO-GO** para clientes: os
gates de contrato/E2E Chatwoot-EvolutionAPI-WhatsApp, secrets/TLS/rede,
privacidade/DPA, observabilidade provisionada, aprovacao de owners e revisao
independente continuam pendentes ou bloqueados por ambiente externo. O
`promtool` tambem precisa ser executado no CI, pois nao esta instalado no
checkout local. O checkout agora usa `X-Chatwoot-Delivery` quando presente,
falha fechado para URL Chatwoot sem TLS em producao e nao imprime corpos de
resposta de provedores nos detalhes do smoke.

## Resultado esperado

Ao final do programa, cada mensagem deve possuir uma trilha recuperavel:

```text
Chatwoot persisted
  -> ingress accepted
  -> inbound receipt committed
  -> turn queued
  -> turn started
  -> response intent committed
  -> response reconciled with Chatwoot
  -> response receipt persisted
```

O sistema deve garantir:

- nenhuma mensagem autentica desaparece silenciosamente;
- uma mensagem inbound produz uma unica resposta logica;
- retry, timeout e restart nao duplicam resposta nem tool mutavel;
- handoff humano congela o bot de forma persistente;
- perda do Redis nao apaga o estado operacional necessario;
- toda falha relevante gera alerta, auditoria e caminho de recuperacao;
- o fluxo WhatsApp -> Chatwoot -> agente -> Chatwoot -> WhatsApp e comprovado no ambiente de staging.

## Principios nao negociaveis

1. **Persistencia antes do efeito externo:** a intencao de envio precisa existir antes do `POST` ao Chatwoot.
2. **Idempotencia por identidade do evento:** o ID do evento/mensagem e a chave principal; conteudo igual nao pode, sozinho, descartar uma nova mensagem.
3. **PostgreSQL como fonte de verdade:** Redis serve para fila, cache e lock; handoff, turnos, recibos e estado auditavel ficam persistidos.
4. **Fail closed em handoff:** se houver duvida sobre o estado humano, o bot nao responde.
5. **Side effects explicitos:** Chatwoot, agenda, labels, notas e notificacoes precisam de registros, retry seguro e reconciliacao.
6. **Menor privilegio e menor dado:** secrets, PII, logs, filas e provedores externos recebem somente o necessario.
7. **Evidencia antes de declaracao:** teste unitario nao substitui teste de staging nem aprovacao operacional.
8. **Rollout reversivel:** o piloto deve ser limitado por inbox/feature flag e possuir rollback documentado.

## Arquitetura alvo

```text
Chatwoot
   |
   v
Webhook HMAC + source policy + schema
   |
   v
Durable inbound receipt/inbox
   |
   v
Conversation turn queue + per-conversation ordering
   |
   v
Worker lease + DB automation state + Redis lock/cache
   |
   v
RAG/IA/tools/guardrails
   |
   v
Durable response intent/outbox
   |
   v
Chatwoot adapter idempotente + reconciliation
   |
   v
Response receipt + audit + metrics
```

O handoff deve seguir uma trilha semelhante:

```text
handoff requested
  -> DB state = handoff_pending
  -> Chatwoot actions queued
  -> labels/note/assignment reconciled
  -> DB state = handoff_active
  -> bot blocked by DB state
```

## Frentes executivas

| Frente | Objetivo | Entregas principais | Gate |
|---|---|---|---|
| GOV | Decidir escopo, owners e criterios | ADR de entrega, risk register, branch protection, aprovadores | G0 |
| OUT | Eliminar duplicacao e perda de efeitos externos | inbox inbound, response outbox, idempotencia e reconciliacao Chatwoot | G1 |
| REL | Tornar fila e concorrencia recuperaveis | ordenacao, lock renovavel, retry classificado, DLQ replay | G2 |
| HOF | Tornar handoff persistente e fail-closed | estado no PostgreSQL, transicao idempotente, retomada controlada | G2 |
| CTX | Recuperar contexto depois de perda do Redis | reidratacao, ordenacao e limites de historico | G2 |
| PRV/SEC | Fechar dados, secrets e transportes | retencao, expurgo, DPA, TLS, secret manager e PII | G3 |
| OBS | Operar com sinais confiaveis | readiness, metricas externas, alertas e on-call | G3 |
| E2E | Provar o caminho real | conta/inbox/numero de teste, matriz funcional e falhas | G4 |
| DR/OPS | Provar recuperacao e rollback | carga, restart, restore, RPO/RTO e runbooks | G5 |
| PILOT | Liberar de forma limitada | piloto supervisionado e ata de go/no-go | G6 |

## Metas de aceite propostas

As metas abaixo devem ser confirmadas pelo owner operacional antes do Gate G0. Elas sao limites iniciais para o primeiro piloto:

| Indicador | Meta inicial |
|---|---:|
| Webhook aceito com `202` | p95 <= 2 s; falha de fila alertada |
| Mensagens inbound perdidas no teste | 0 |
| Respostas duplicadas apos retry/restart | 0 |
| Mensagens validas enviadas a DLQ sem replay | 0 |
| Conversas em handoff que recebem resposta do bot | 0 |
| Cenarios criticos E2E aprovados | 100% |
| Erros de envio sem registro de reconciliacao | 0 |
| PII identificavel em logs de producao | 0 |
| RPO e RTO | aprovados pelo owner antes do G5 |
| P0 aberto no go-live | 0 |
| P1 sem aceite formal | 0 |

## Governanca e responsabilidades

| Papel | Responsabilidade |
|---|---|
| Sponsor/Operacao | aprovar escopo, SLO, piloto, textos e go/no-go |
| Tech Lead | aprovar arquitetura, trade-offs e PRs criticos |
| Backend | implementar inbox/outbox, estado, worker e reconciliacao |
| Security | revisar autenticacao, secrets, TLS, input e side effects |
| Privacy/DPO | aprovar finalidade, retencao, DPA, legal hold e eliminacao |
| SRE/DevOps | provisionar ambiente, observabilidade, backup, restore e rollback |
| QA | executar matriz E2E, carga, restart e evidencias |
| Operacao hospitalar | validar handoff, emergencia, agenda e experiencia do cliente |

Nenhum owner foi presumido neste documento. Os nomes e aprovadores devem ser registrados no backlog 79 antes do Gate G0.

## Criterio de Go/No-Go

### Go

Somente quando:

- todos os P0 do backlog 79 estiverem `Concluido` ou formalmente aceitos por autoridade competente;
- todos os P1 tiverem sido concluidos ou possuirem aceite formal de risco;
- a entrega Chatwoot tiver teste de crash depois da aceitacao externa;
- o handoff estiver bloqueando o bot a partir do PostgreSQL;
- o E2E real tiver evidencias com IDs, timestamps e correlation IDs;
- carga, restart, restore, RPO/RTO e rollback estiverem aprovados;
- observabilidade e on-call estiverem ativos;
- a ata de go/no-go estiver assinada por tecnologia, seguranca/privacidade, QA e operacao.

### No-Go

Qualquer um dos itens abaixo bloqueia a liberacao:

- envio externo sem idempotencia e reconciliacao;
- E2E real ausente ou incompleto;
- handoff dependente apenas de Redis/labels/notas;
- mensagens legitimas indo para DLQ sem replay operacional;
- secrets, TLS ou rede alvo nao comprovados;
- politica de retencao, DPA ou legal hold pendentes para dados reais;
- ausencia de backup/restore ou rollback testado;
- alertas e on-call nao testados;
- P0 aberto sem aceite formal.

## Riscos executivos e tratamento

| Risco | Consequencia | Tratamento |
|---|---|---|
| Chatwoot nao oferecer idempotencia nativa | duplicacao apos timeout | response intent, consulta/reconciliacao e chave logica local |
| Redis perder estado | bot responder apos handoff ou perder contexto | estado duravel no PostgreSQL e reidratacao |
| Lock bloquear conversas movimentadas | mensagens na DLQ | fila por conversa, espera, coalescing e replay |
| Contrato real divergir do payload esperado | webhook rejeitado ou mal interpretado | homologacao com captura do corpo bruto e headers |
| DPA/retencao nao aprovados | risco legal e impossibilidade de uso com PII | Gate G3 bloqueante com DPO |
| Falha de provedor externo | atraso ou fallback incorreto | timeout, circuit breaker, handoff e teste de indisponibilidade |

## Resultado final esperado

O resultado nao e apenas um build verde. E uma release com comportamento recuperavel, evidencia externa, responsabilidade definida e decisao formal de risco.
