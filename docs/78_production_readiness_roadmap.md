# 78 - Roadmap de Prontidao para Producao

## Objetivo

Organizar a execucao do plano 77 em gates pequenos, verificaveis e reversiveis. O cronograma usa semanas relativas a aprovacao do plano e pode ser ajustado pelos owners sem alterar os criterios de aceite.

## Linha critica

```text
G0 governanca
  -> G1 semantica de entrega
  -> G2 estado/handoff/concorrencia
  -> G3 seguranca/privacidade/operacao
  -> G4 E2E externo
  -> G5 carga/restore/rollback
  -> G6 piloto e go/no-go
```

G3 pode iniciar em paralelo com G1 e G2. G4 depende de um ambiente real provisionado e de G1/G2 minimamente estaveis. G6 nao pode iniciar enquanto qualquer P0 estiver aberto.

## Estado de execucao em 2026-08-08

| Gate | Estado atual | Evidencia local | Bloqueio remanescente |
|---|---|---|---|
| G0 | Em Review | ADRs 010-016, plano executivo, `CODEOWNERS` e template de PR preparados localmente | Owners, aprovadores independentes e branch protection ainda nao formalizados |
| G1 | Em Review | Inbox/outbox duraveis, idempotencia, reconciliacao, crash test e marcador flat | Contrato real do Chatwoot ainda precisa ser capturado e aprovado |
| G2 | Em Review | Handoff fail-closed, optimistic version, lock/lease, DLQ, tools, reidratacao, fencing de expiracao e scheduling state duravel | Revisao independente e evidencia no ambiente alvo |
| G3 | Parcial / bloqueado | Privacy runtime, readiness, metricas, alertas, scanner de artefatos e validacao de config | DPO/DPA, secrets, TLS, rede privada, on-call e `promtool` no CI |
| G4 | Bloqueado | Matriz, workflow e smoke com confirmacao real preparados | Conta/inbox/numero WhatsApp e provedores de staging |
| G5 | Bloqueado | Gate descartavel local executado | RPO/RTO, carga, restore e rollback no staging alvo |
| G6 | Bloqueado | Criterios e runbooks definidos | Todos os P0, aceite formal e piloto supervisionado |

O cronograma continua valido, mas a janela relativa deve ser contada a partir
da liberacao do ambiente de staging e da nomeacao dos owners. Nenhum gate
externo foi declarado concluido com base apenas nos testes locais.

## Gates e cronograma

| Gate | Janela | Foco | Saida obrigatoria | Dependencias |
|---|---|---|---|---|
| G0 | Dias 0-2 | governanca e congelamento | owners, ADRs, risco e escopo de staging | nenhuma |
| G1 | Semana 1-2 | entrega inbound/outbound | inbox, outbox, idempotencia e reconciliacao | G0 |
| G2 | Semana 2-3 | runtime e handoff | estado DB, ordenacao, lock, replay e reidratacao | G1 parcial |
| G3 | Semana 2-4 | seguranca, privacidade e operacao | TLS/secrets, retencao, readiness, alertas e runbooks | G0 |
| G4 | Semana 4-5 | homologacao E2E | contrato Chatwoot e matriz WhatsApp real aprovados | G1, G2, G3 |
| G5 | Semana 5-6 | confiabilidade e recuperacao | carga, concorrencia, restart, restore, RPO/RTO e rollback | G4 |
| G6 | Semana 7 | piloto e decisao | piloto limitado, evidencia e ata go/no-go | G5 |

## G0 - Governanca e congelamento

### Objetivo

Impedir que novas features escondam os riscos de integridade e definir quem pode aprovar a liberacao.

### Execucao

- congelar atendimento autonomo com clientes reais;
- manter apenas staging com dados sinteticos e inbox de teste;
- nomear Sponsor, Tech Lead, Backend, Security, Privacy/DPO, SRE, QA e Operacao;
- aprovar ADR de semantica de entrega, estado de handoff e criterio de confirmacao Chatwoot;
- criar risk register com owner e prazo;
- abrir PR/branch revisavel e ativar branch protection.

### Saida

Ata de G0, ADRs aprovadas, backlog 79 com owners e ambiente de staging identificado.

## G1 - Semantica de entrega e idempotencia

### Objetivo

Eliminar o risco de uma resposta duplicada ou de uma mensagem aceita pelo Chatwoot sem recibo local.

### Execucao

- criar registro duravel de inbound receipt/inbox;
- definir chave unica por tenant, evento, conversa e mensagem Chatwoot;
- criar response intent/outbox ligado ao turno inbound;
- persistir estado `pending`, `sending`, `sent`, `unknown`, `failed` e `reconciled`;
- implementar adapter Chatwoot com timeout, retry seguro e consulta/reconciliacao;
- simular crash depois do aceite externo e antes do retorno local;
- separar deduplicacao por ID de mensagem de qualquer deduplicacao opcional por conteudo.
- validar o caminho flat do webhook sem perder `cvg_idempotency_key`.

### Saida

Nenhum cenario de retry/restart gera duas respostas logicas e todo envio em estado `unknown` possui reconciliacao ou alerta operacional.

## G2 - Estado de conversa, handoff e concorrencia

### Objetivo

Garantir que o bot respeite o humano, que mensagens mantenham ordem e que Redis nao seja a unica fonte de recuperacao.

### Execucao

- adicionar estado duravel de automacao e handoff no PostgreSQL;
- consultar handoff ativo antes de iniciar qualquer turno;
- tornar labels, notas e transicoes Chatwoot idempotentes;
- criar fila/coalescing por conversa e espera controlada pelo lock;
- renovar lock com fencing token ou mecanismo equivalente;
- classificar erros transitorios/permanentes e implementar backoff;
- criar replay autenticado e auditado da DLQ;
- reidratar contexto a partir do PostgreSQL ou Chatwoot apos perda do Redis;
- persistir o estado de agendamento em PostgreSQL, usando Redis somente como
  cache e migrando legado antes de qualquer decisao mutavel;
- usar timestamp original do evento Chatwoot para ordenar mensagens.

### Saida

Mensagens concorrentes permanecem ordenadas, handoff ativo impede resposta do bot e restart do Redis nao apaga o estado necessario.

## G3 - Seguranca, privacidade e operacao

### Objetivo

Fechar os controles necessarios para operar dados reais com menor privilegio e capacidade de resposta a incidente.

### Execucao

- aprovar inventario, finalidade, retencao, legal hold, DPA e fornecedores;
- implementar expurgo automatico e auditavel de filas, DLQ, contexto, logs e dados vencidos;
- habilitar e testar a API de privacidade com checkpoints e chaves reais do ambiente alvo;
- remover a excecao insegura padrao do Compose e comprovar TLS, ACL e secret manager;
- garantir que Qdrant, logs e provedores externos recebam apenas dados permitidos;
- executar `npm run security:scan-artifacts -- <amostras>` sem findings de PII;
- estender readiness para dependencias e capacidade minima do worker;
- provisionar metricas externas, dashboards, alertas e on-call;
- finalizar runbooks de deploy, rollback, DLQ, incidente e restore.

### Saida

DPO/Security/SRE aprovam o ambiente alvo, os secrets, os transportes, a retencao e os sinais operacionais.

## G4 - E2E real em staging

### Objetivo

Provar o contrato externo e o fluxo completo com uma conta, inbox e numero de teste.

### Matriz obrigatoria

1. saudacao, intake, RAG e resposta normal;
2. pergunta de horario/servico/preco baseada em conhecimento;
3. agenda com confirmacao, retry e ownership;
4. emergencia, baixa confianca e handoff;
5. mensagem duplicada com mesmo ID;
6. mensagens diferentes com mesmo conteudo;
7. resposta humana e congelamento do bot;
8. Chatwoot aceitando resposta antes de timeout local;
9. indisponibilidade de OpenAI/OpenRouter/Qdrant/Chatwoot;
10. replay de evento, restart do worker e recuperacao da fila.

### Saida

Cada cenario possui timestamp, ID Chatwoot, correlation ID, resultado observado e aprovador.

## G5 - Carga, restore e rollback

### Objetivo

Medir o comportamento sob concorrencia e provar que a operacao pode ser recuperada.

### Execucao

- executar carga por inbox e por conversa;
- medir queue age, latencia de turno, retry, DLQ e duplicidade;
- reiniciar worker, Redis, PostgreSQL e dependencias externas em cenarios controlados;
- validar backup/restore e RPO/RTO no ambiente de staging alvo;
- testar rollback de imagem e migration;
- comprovar que jobs em `sending` e `unknown` sao reconciliados sem duplicacao.

### Saida

Relatorio de capacidade, RPO/RTO, rollback e incidentes simulado com limites aprovados.

## G6 - Piloto e go/no-go

### Objetivo

Liberar de forma limitada somente depois de todas as evidencias.

### Execucao

- habilitar somente uma inbox ou segmento controlado;
- manter supervisao humana e canal de incidente;
- monitorar por uma janela definida pelo owner operacional;
- revisar amostra de respostas, handoffs, DLQ e alertas;
- executar reuniao formal de go/no-go;
- documentar rollback e decisao de ampliar, manter ou interromper o piloto.

### Saida

Ata assinada, risk register atualizado, P0 zerado e P1 aceito ou concluido.

## Tracks paralelos

| Track | Pode iniciar | Entrega |
|---|---|---|
| Governanca | imediatamente | G0 |
| Outbox/inbox | apos ADR de G0 | G1 |
| Handoff/contexto | em paralelo a G1 | G2 |
| TLS/secrets/privacy | apos owners definidos | G3 |
| Ambiente Chatwoot/WhatsApp | imediatamente, depende de terceiros | habilita G4 |
| Observabilidade/runbooks | em paralelo a G1 | G3/G5 |
| QA matrix | apos contratos de G1/G2 | G4/G5 |

## Criterios de interrupcao

O rollout deve ser interrompido e voltar para staging se ocorrer qualquer um dos casos:

- resposta duplicada confirmada;
- mensagem sem receipt, sem retry ou sem DLQ rastreavel;
- bot responder conversa em handoff ativo;
- PII aparecer em log, metricas ou provedor nao aprovado;
- DLQ crescer sem owner ou replay funcionando;
- dependencia critica indisponivel sem fallback/handoff seguro;
- RPO/RTO exceder o limite aprovado;
- qualquer alerta critico ficar sem atendimento.
