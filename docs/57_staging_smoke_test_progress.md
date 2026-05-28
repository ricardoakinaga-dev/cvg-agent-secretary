# 57 - Smoke Test de Staging

## Objetivo

Transformar a pendencia externa do fluxo real em uma verificacao executavel quando houver ambiente de staging/producao disponivel.

O smoke test cobre:

```text
/health -> /ready -> webhook Chatwoot assinado
```

Ele nao substitui o teste manual ou automatizado via WhatsApp/EvolutionAPI real, mas valida que a URL publica do agent esta viva, pronta e aceitando webhooks assinados com o mesmo segredo configurado no Chatwoot.

## Arquivos Criados

```text
src/modules/readiness/stagingSmoke.ts
src/scripts/staging-smoke.ts
tests/unit/staging-smoke.test.ts
```

## Comando Adicionado

```bash
npm run smoke:staging
```

## Variaveis Necessarias

```text
AGENT_BASE_URL
CHATWOOT_WEBHOOK_SECRET
SMOKE_CHATWOOT_CONVERSATION_ID
SMOKE_CHATWOOT_ACCOUNT_ID
SMOKE_CHATWOOT_INBOX_ID
SMOKE_CHATWOOT_CONTACT_ID
SMOKE_CHATWOOT_CONTACT_NAME
SMOKE_MESSAGE_CONTENT
SMOKE_STRICT_HEALTH
SMOKE_TIMEOUT_MS
```

As variaveis foram documentadas em:

```text
.env.example
```

## O Que o Smoke Test Valida

1. `GET /health`
   - em modo estrito, exige status `healthy`;
   - com `SMOKE_STRICT_HEALTH=false`, aceita `healthy` ou `degraded`.

2. `GET /ready`
   - exige HTTP 200;
   - exige payload `{ "ready": true }`.

3. `POST /webhooks/chatwoot`
   - monta payload `message_created`;
   - assina com HMAC SHA-256 usando `CHATWOOT_WEBHOOK_SECRET`;
   - envia header `x-chatwoot-signature`;
   - exige HTTP 200 e payload `{ "success": true }`.

## Testes Automatizados

O teste unitario cobre:

- sequencia health/readiness/webhook;
- assinatura HMAC correta;
- payload Chatwoot sintetico;
- health degradado com strict mode desligado;
- falha de readiness e webhook;
- leitura das variaveis de ambiente;
- erro claro para variaveis obrigatorias ausentes.

## Validacoes Executadas

```bash
npm test -- tests/unit/staging-smoke.test.ts
npm run lint
npm run typecheck
npm run test:coverage
npm test
npm run build
npm audit --omit=dev
docker compose --env-file .env.example config
docker build -t cvg-secretary-agent:codex-check .
```

Resultado:

```text
staging-smoke: 5 testes passando
testes completos: 230 testes, 25 suites, tudo passando
coverage: 84.69% statements, 74.80% branches, 89.79% functions, 85.37% lines
lint: passou
typecheck: passou
build: passou
npm audit --omit=dev: 0 vulnerabilidades
docker compose config: passou
docker build: passou
```

## Uso em Staging

Exemplo:

```bash
AGENT_BASE_URL=https://agent.example.com \
CHATWOOT_WEBHOOK_SECRET=*** \
SMOKE_CHATWOOT_CONVERSATION_ID=123 \
SMOKE_CHATWOOT_ACCOUNT_ID=1 \
SMOKE_CHATWOOT_INBOX_ID=2 \
SMOKE_CHATWOOT_CONTACT_ID=99 \
npm run smoke:staging
```

Saida esperada:

```text
PASS health status=200 ...
PASS readiness status=200 ...
PASS signed_chatwoot_webhook status=200 ...
```

## Limite da Validacao

Este smoke test prova o recebimento de webhook assinado pelo agent. A prova final do fluxo completo ainda depende de um teste real:

```text
Tutor -> WhatsApp -> EvolutionAPI -> Chatwoot -> agent-secretary -> Chatwoot -> EvolutionAPI -> WhatsApp
```

Esse teste exige instancia EvolutionAPI, Chatwoot e WhatsApp reais.

*Registro criado em 2026-05-27.*
