# 49 - Runbook de Producao, Rollback e Incidentes

## Objetivo

Operar o `cvg-agent-secretary` em producao ou piloto supervisionado com um procedimento repetivel para:

- validar release;
- configurar ambiente;
- fazer deploy;
- validar saude;
- executar rollback;
- responder incidentes.

Este runbook cobre o trecho controlado pelo projeto:

```text
Chatwoot webhook -> agent-secretary -> Chatwoot response
```

A entrega WhatsApp depende do arranjo externo:

```text
WhatsApp -> EvolutionAPI -> Chatwoot -> EvolutionAPI -> WhatsApp
```

## Variaveis de Ambiente

Use `.env.example` como base. Nunca commitar `.env` real.

Obrigatorias:

| Variavel | Uso |
|---|---|
| `NODE_ENV=production` | ativa validacoes de producao |
| `PORT` | porta HTTP |
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | Redis |
| `OPENAI_API_KEY` | provider OpenAI |
| `CHATWOOT_API_URL` | URL do Chatwoot |
| `CHATWOOT_API_TOKEN` | token API Chatwoot |
| `CHATWOOT_ACCOUNT_ID` | conta Chatwoot |
| `CHATWOOT_WEBHOOK_SECRET` | assinatura HMAC do webhook |
| `API_ADMIN_TOKEN` | autenticacao dos endpoints `/api` |

Opcionais:

| Variavel | Uso |
|---|---|
| `AI_PROVIDER` | `openai`, `openrouter` ou `auto` |
| `OPENROUTER_API_KEY` | fallback OpenRouter |
| `OPENROUTER_MODEL` | modelo OpenRouter |
| `QDRANT_URL` | ativa vector store Qdrant |
| `QDRANT_API_KEY` | auth Qdrant |
| `QDRANT_COLLECTION` | colecao Qdrant |
| `EVOLUTION_API_URL` | provider direto EvolutionAPI, fora do runtime principal |
| `EVOLUTION_API_KEY` | chave EvolutionAPI |
| `WHATSAPP_INSTANCE` | instancia EvolutionAPI |

## Pre-Release Gate

Rodar antes de qualquer deploy:

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm audit --omit=dev
docker build -t cvg-secretary-agent:release-check .
```

Criterio minimo:

- todos os comandos passam;
- `npm audit --omit=dev` sem high/critical;
- webhook assinado testado;
- `/api` protegido por token;
- cobertura nao cai abaixo dos thresholds configurados.

Criterio alvo:

- cobertura agregada 80%+ em statements/lines;
- E2E em staging com Chatwoot/EvolutionAPI;
- Qdrant validado se `QDRANT_URL` estiver habilitado.

## Deploy com Docker Compose

1. Preparar env:

```bash
cp .env.example .env
```

2. Editar `.env` com secrets reais.

3. Subir dependencias e app:

```bash
docker compose up -d --build
```

4. Verificar containers:

```bash
docker compose ps
docker compose logs -f agent
```

5. Validar saude:

```bash
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:3000/ready
```

`/health` deve reportar:

- `redis: connected`
- `postgres: connected`
- `chatwoot: connected`
- `openai: connected`

`/ready` deve retornar:

```json
{"ready":true}
```

## Configuracao Chatwoot

Webhook:

```text
POST https://<host>/webhooks/chatwoot
```

Eventos esperados:

- `message_created`
- `conversation_created`
- `conversation_status_changed`

Seguranca:

- configurar o mesmo valor de `CHATWOOT_WEBHOOK_SECRET` no Chatwoot e no agent;
- chamadas com assinatura invalida devem retornar `401`.

## Validacao Pos-Deploy

### 1. API operacional protegida

Sem token deve falhar:

```bash
curl -i http://localhost:3000/api/metrics
```

Com token deve passar:

```bash
curl -fsS \
  -H "x-api-key: $API_ADMIN_TOKEN" \
  -H "x-user-role: admin" \
  http://localhost:3000/api/metrics
```

### 2. Agenda administrativa

Criar servico:

```bash
curl -fsS -X POST http://localhost:3000/api/scheduling/services \
  -H "content-type: application/json" \
  -H "x-api-key: $API_ADMIN_TOKEN" \
  -H "x-user-role: manager" \
  -d '{"name":"Consulta clinica","durationMinutes":30}'
```

Criar slot:

```bash
curl -fsS -X POST http://localhost:3000/api/scheduling/slots \
  -H "content-type: application/json" \
  -H "x-api-key: $API_ADMIN_TOKEN" \
  -H "x-user-role: manager" \
  -d '{"startsAt":"2026-06-01T13:00:00.000Z","endsAt":"2026-06-01T13:30:00.000Z"}'
```

### 3. Knowledge admin

Fluxo esperado:

```text
POST /api/knowledge/documents
POST /api/knowledge/documents/:id/submit-review
POST /api/knowledge/documents/:id/approve
POST /api/knowledge/documents/:id/publish
```

Publicacao direta de documento nao aprovado deve falhar.

### 4. Conversa real

Enviar mensagem pelo WhatsApp em ambiente de staging e verificar:

1. mensagem chega no Chatwoot;
2. webhook chega no agent;
3. agent busca knowledge;
4. agent chama IA;
5. resposta aparece no Chatwoot;
6. EvolutionAPI entrega no WhatsApp.

## Rollback

### Rollback de imagem

1. Identificar versao anterior saudavel:

```bash
docker images | grep cvg-secretary-agent
```

2. Subir imagem anterior:

```bash
docker compose down
docker tag cvg-secretary-agent:<previous> cvg-secretary-agent:rollback
docker compose up -d
```

3. Validar:

```bash
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:3000/ready
```

### Rollback funcional rapido

Se o problema for IA, agenda ou knowledge, preferir mitigacao operacional antes de rollback total:

- desabilitar Qdrant removendo `QDRANT_URL`;
- trocar `AI_PROVIDER=openai` para evitar fallback textual;
- pausar webhook no Chatwoot;
- colocar conversas criticas em handoff humano;
- remover slots problemáticos da agenda ou marcar como `blocked` no banco.

## Incidentes

### Webhook rejeitado

Sintomas:

- Chatwoot mostra falha de webhook;
- agent loga assinatura invalida;
- status HTTP `401`.

Acao:

1. conferir `CHATWOOT_WEBHOOK_SECRET`;
2. garantir que Chatwoot assina o body bruto correto;
3. repetir envio de evento;
4. nao remover verificacao de assinatura em producao.

### API operacional exposta/falhando

Sintomas:

- `/api/*` retorna `401`, `403` ou dados indevidos.

Acao:

1. conferir `API_ADMIN_TOKEN`;
2. conferir header `x-user-role`;
3. revisar permissoes RBAC;
4. rotacionar token se houve exposicao.

### OpenAI indisponivel

Sintomas:

- `/health` com `openai: error`;
- aumento de `fallback_triggered`;
- respostas de fallback.

Acao:

1. verificar chave e cota OpenAI;
2. conferir `AI_PROVIDER`;
3. se usar `auto`, verificar OpenRouter;
4. acionar handoff humano para conversas abertas.

### Chatwoot indisponivel

Sintomas:

- `/ready` false;
- respostas nao aparecem no Chatwoot;
- erro em `chatwootClient.sendMessage`.

Acao:

1. verificar `CHATWOOT_API_URL`, token e account id;
2. testar API do Chatwoot externamente;
3. pausar campanha/entrada se houver fila acumulando;
4. reprocessar manualmente conversas criticas pelo Chatwoot.

### Agenda confirmando incorretamente

Sintomas:

- tutor recebe confirmacao incorreta;
- conflito de slot;
- `confirm_appointment` falha.

Acao:

1. verificar tabela `appointments`;
2. verificar status do slot em `appointment_slots`;
3. manter atendimento humano ate entender a causa;
4. corrigir slot via admin `/api/scheduling` ou banco;
5. revisar logs de tool calling.

### Knowledge/RAG incorreto

Sintomas:

- resposta usa informacao errada;
- chunk incorreto recuperado;
- conteudo nao aprovado apareceu.

Acao:

1. localizar documento em `/api/knowledge/documents`;
2. se necessario, rejeitar/desativar conteudo;
3. publicar versao corrigida;
4. se Qdrant estiver ativo, validar sincronizacao da colecao;
5. usar handoff para conversas ja impactadas.

### Qdrant indisponivel

Sintomas:

- logs de fallback para PostgreSQL full-text;
- queda de qualidade de retrieval vetorial.

Acao:

1. conferir `QDRANT_URL`, `QDRANT_API_KEY` e colecao;
2. testar endpoint Qdrant em staging;
3. manter fallback Postgres ativo;
4. remover `QDRANT_URL` para desabilitar vetorial se necessario.

## Metricas e Auditoria

Endpoints:

```text
GET /api/metrics
GET /api/analytics/dashboard
GET /api/audit/events
GET /api/operational-report
```

Todos exigem:

```text
x-api-key: <API_ADMIN_TOKEN>
x-user-role: admin ou manager
```

Eventos importantes:

- `message_received`
- `response_sent`
- `fallback_triggered`
- `handoff_triggered`
- `knowledge_published`
- `knowledge_rejected`

## Criterio de Producao Real

Liberar producao real apenas quando:

- release gate passa;
- `/health` saudavel;
- `/ready` true;
- webhook invalido rejeita;
- `/api` exige auth/RBAC;
- agenda confirma apenas via `confirm_appointment`;
- handoff aparece em banco, audit trail e Chatwoot;
- knowledge exige curadoria antes de publicar;
- operacao sabe executar rollback;
- staging validou Chatwoot/EvolutionAPI ponta a ponta.

Estado atual: **apto para homologacao e piloto supervisionado**. Producao autonoma plena ainda exige E2E real externo e cobertura alvo 80%+.
