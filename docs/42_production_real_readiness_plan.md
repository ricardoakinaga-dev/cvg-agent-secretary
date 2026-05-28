# 42 - Plano Executivo, Backlog e Roadmap para Producao Real

## Objetivo

Levar o `agent-secretary` de **producao assistida** para **producao real**, corrigindo os bloqueadores identificados na auditoria atual.

Escopo das correcoes:

1. Lint e vulnerabilidades.
2. Autenticacao/RBAC nos endpoints `/api`.
3. Validacao de assinatura do webhook Chatwoot.
4. Guardrails antes/depois da IA no `agentRuntime`.
5. Handoff real e auditavel.
6. Agenda real com tools transacionais.
7. Base de conhecimento com pipeline administrativo confiavel.

## Plano Executivo

### Meta de Saida

Agente capaz de:

- responder tutores via Chatwoot/WhatsApp;
- consultar conhecimento institucional;
- aplicar guardrails em tempo de execucao;
- transferir para humano quando necessario;
- consultar e confirmar agenda com tools transacionais;
- expor endpoints operacionais com autenticacao e autorizacao;
- operar com observabilidade, auditoria e criterios claros de rollback.

### Nota Alvo

**90+/100** apos execucao completa.

### Fases Executivas

| Fase | Objetivo | Resultado esperado |
|---|---|---|
| P0 | Fechar riscos bloqueantes | Build, lint, audit, webhook e `/api` seguros |
| P1 | Tornar conversa segura | Guardrails reais antes/depois da IA |
| P2 | Handoff operacional | Transferencia humana rastreavel e auditavel |
| P3 | Agenda transacional | Consultar, reservar e confirmar horarios com seguranca |
| P4 | Knowledge admin | Pipeline confiavel para criar, revisar e publicar conhecimento |
| P5 | Readiness final | Testes, observabilidade, runbook e validacao E2E |

## Backlog Priorizado

| Prioridade | Item | Descricao | Criterio de aceite |
|---|---|---|---|
| P0 | Corrigir lint | Adicionar config ESLint compativel com TypeScript e corrigir erros | `npm run lint` passa com 0 erros |
| P0 | Corrigir vulnerabilidades | Rodar `npm audit fix`, revisar updates breaking, atualizar libs vulneraveis | `npm audit --omit=dev` sem high/critical |
| P0 | Proteger `/api` | Criar middleware auth + RBAC para metricas, audit, dashboard e operational report | Endpoints `/api/*` exigem credencial valida |
| P0 | Validar webhook Chatwoot | Implementar verificacao de assinatura usando `CHATWOOT_WEBHOOK_SECRET` | Webhook invalido retorna 401/403 |
| P0 | Testes de seguranca | Cobrir auth, RBAC e webhook signature | Testes automatizados cobrindo happy path e rejeicao |
| P1 | Guardrails pre-IA | Conectar `checkGuardrails` antes da chamada ao modelo | Jailbreak, dados sensiveis e risco clinico sao tratados antes da IA |
| P1 | Guardrails pos-IA | Conectar `checkResponseGuardrails` antes de enviar ao Chatwoot | Diagnostico, prescricao e prognostico sao bloqueados |
| P1 | Fallback seguro | Criar resposta segura para baixa confianca/falta de conhecimento | Agente nao inventa quando nao ha base |
| P1 | Metricas de guardrails | Registrar bloqueios, handoffs e fallbacks | Dashboard mostra eventos de seguranca |
| P2 | Handoff real | Integrar `create_handoff` ao fluxo principal | Handoff cria registro persistido |
| P2 | Handoff Chatwoot | Adicionar label/status/atribuicao no Chatwoot quando houver handoff | Conversa aparece claramente para humano |
| P2 | Auditoria de handoff | Registrar `handoff_triggered` com motivo e resumo | Evento aparece em `audit_events` |
| P2 | Notificacao de setor | Acionar `notify_sector` para recepcao/clinico/financeiro | Setor correto recebe tarefa/notificacao |
| P3 | Modelo de agenda | Criar tabelas/contratos para servicos, profissionais, slots, reservas e confirmacoes | Schema migrado e testado |
| P3 | Tool `check_available_slots` | Consultar horarios disponiveis por servico, data e preferencia | Retorna slots reais e filtrados |
| P3 | Tool `reserve_slot` | Criar reserva temporaria para evitar conflito | Dois tutores nao pegam o mesmo horario |
| P3 | Tool `confirm_appointment` | Confirmar horario reservado | Agente so confirma apos sucesso da tool |
| P3 | Tool `reschedule/cancel` | Reagendar ou cancelar atendimento | Historico e status atualizados |
| P3 | Estado conversacional | Controlar etapa da conversa de agendamento | Fluxo nao perde contexto no meio |
| P4 | API admin knowledge | Criar endpoints para criar, listar, revisar, aprovar e publicar conhecimento | Admin consegue gerenciar documentos |
| P4 | Pipeline documento -> chunks | Garantir geracao de chunks na publicacao | Documento publicado aparece em `knowledge_chunks` |
| P4 | Curadoria obrigatoria | Separar draft, pending_review, published, rejected | Conteudo so entra no RAG apos aprovacao |
| P4 | Busca validada | Testar recuperacao de perguntas reais | Perguntas frequentes retornam chunks corretos |
| P4 | Preparar Qdrant | Criar interface/adapter opcional para Qdrant | Runtime consegue alternar Postgres/Qdrant |
| P5 | E2E Chatwoot | Testar webhook -> IA -> resposta Chatwoot | Fluxo critico validado |
| P5 | E2E agenda | Testar consulta e confirmacao de horario | Confirmacao so ocorre via tool |
| P5 | Observabilidade | Metricas de IA, agenda, handoff, guardrails e knowledge | Dashboard operacional confiavel |
| P5 | Runbook producao | Documentar deploy, env vars, rollback e incidentes | Operacao consegue agir sem engenharia |
| P5 | Release gate | Checklist final antes de producao | Todos os gates passam |

## Roadmap

### Semana 1 - Seguranca e Qualidade P0

Objetivo: remover bloqueadores de producao.

Entregas:

- ESLint configurado e passando.
- Vulnerabilidades high/critical corrigidas.
- `/api/*` protegido com auth/RBAC.
- Webhook Chatwoot validando assinatura.
- Testes unitarios/integrados para seguranca.

Comandos de aceite:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

### Semana 2 - Guardrails e Handoff P1/P2

Objetivo: impedir respostas perigosas e garantir transferencia humana.

Entregas:

- Guardrails pre-IA no `agentRuntime`.
- Guardrails pos-IA antes de enviar ao Chatwoot.
- Handoff persistido.
- Label/status/atribuicao no Chatwoot.
- Auditoria de handoff.
- Metricas de seguranca.

Criterios de aceite:

- pedido de diagnostico nao gera diagnostico;
- pedido de remedio nao gera prescricao;
- emergencia gera handoff;
- tentativa de jailbreak e bloqueada;
- handoff aparece em banco, audit trail e Chatwoot.

### Semana 3-4 - Agenda Transacional P3

Objetivo: permitir consulta e confirmacao de horarios com seguranca.

Entregas:

- Schema de agenda.
- Repositorio de agenda.
- Tools:
  - `check_available_slots`
  - `reserve_slot`
  - `confirm_appointment`
  - `cancel_appointment`
  - `reschedule_appointment`
- Estado conversacional para agendamento.
- Testes contra conflito de reserva.

Regra obrigatoria:

```text
O agente nunca pode dizer "horario confirmado" sem `confirm_appointment` retornar sucesso.
```

### Semana 5 - Base de Conhecimento Administravel P4

Objetivo: tornar a base de conhecimento confiavel e operavel.

Entregas:

- Endpoints admin para knowledge.
- Fluxo draft -> review -> published.
- Geracao automatica de chunks.
- Testes de retrieval.
- Preparacao para Qdrant como adapter opcional.

Criterios de aceite:

- admin cadastra conteudo;
- conteudo fica pendente;
- aprovacao publica;
- chunks sao gerados;
- pergunta real recupera trecho correto.

### Semana 6 - Readiness Final P5

Objetivo: validar producao real.

Entregas:

- E2E do fluxo Chatwoot.
- E2E de agenda.
- E2E de handoff.
- Dashboard operacional.
- Runbook.
- Checklist final.
- Docker e CI verdes.

Criterio de producao:

```text
lint: pass
typecheck: pass
tests: pass
coverage: >=80% ideal, sem queda critica
build: pass
docker build: pass
audit: sem high/critical
/api protegido: sim
webhook assinado: sim
guardrails runtime: sim
agenda transacional: sim
handoff auditavel: sim
knowledge admin: sim
```

## Sequencia Recomendada de Execucao

1. Corrigir lint e vulnerabilidades.
2. Proteger endpoints e webhook.
3. Conectar guardrails no runtime.
4. Fechar handoff real.
5. Construir agenda transacional.
6. Criar pipeline administrativo de conhecimento.
7. Rodar E2E e readiness final.

## Definicao de Pronto Para Producao Real

O agente so deve ir para producao real quando:

- nenhum endpoint operacional sensivel estiver publico sem auth;
- webhook invalido for rejeitado;
- o agente nao puder diagnosticar, prescrever ou inventar;
- handoff funcionar de ponta a ponta;
- confirmacao de horario depender de tool transacional;
- base de conhecimento tiver curadoria antes de publicacao;
- CI passar completo;
- operacao tiver runbook e metricas minimas.

## Riscos e Dependencias

| Risco | Impacto | Mitigacao |
|---|---|---|
| Agenda sem fonte unica da verdade | Confirmacoes incorretas | Criar modulo transacional antes de permitir confirmacao |
| Guardrails apenas no prompt | Respostas clinicas perigosas | Aplicar guardrails programaticos antes/depois da IA |
| Endpoints operacionais expostos | Vazamento de metricas/auditoria | Auth/RBAC obrigatorio em `/api/*` |
| Webhook sem assinatura | Eventos falsos podem acionar o agente | Validar `CHATWOOT_WEBHOOK_SECRET` |
| Knowledge sem curadoria | Informacao errada entra no RAG | Fluxo draft/review/published obrigatorio |
| Qdrant adotado cedo demais | Complexidade operacional prematura | Implementar adapter opcional com fallback Postgres |

## Ordem de Implementacao Recomendada por PR

1. `fix: restore lint and dependency security baseline`
2. `feat: protect operational api endpoints with auth and rbac`
3. `feat: validate chatwoot webhook signatures`
4. `feat: enforce runtime guardrails before and after ai responses`
5. `feat: implement auditable handoff workflow`
6. `feat: add transactional scheduling domain and tools`
7. `feat: add administrative knowledge publishing pipeline`
8. `test: add production readiness e2e coverage`
9. `docs: add production runbook and release checklist`

*Plano registrado em 2026-05-27.*
