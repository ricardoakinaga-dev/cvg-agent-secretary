# 59 - Smoke Test Combinado do Fluxo Externo

## Objetivo

Consolidar as validacoes externas em um unico comando que verifica, na mesma execucao:

- agent publico;
- health/readiness;
- webhook Chatwoot assinado;
- EvolutionAPI conectada;
- envio opcional EvolutionAPI -> WhatsApp.

Esse smoke test aproxima a prova do fluxo:

```text
Tutor -> WhatsApp -> EvolutionAPI -> Chatwoot -> agent-secretary -> Chatwoot -> EvolutionAPI -> WhatsApp
```

## Arquivos Criados

```text
src/modules/readiness/fullFlowSmoke.ts
src/scripts/full-flow-smoke.ts
tests/unit/full-flow-smoke.test.ts
```

## Comando Adicionado

```bash
npm run smoke:full-flow
```

## O Que Ele Executa

Internamente, o comando combina:

```bash
npm run smoke:staging
npm run smoke:evolution
```

Em uma unica saida estruturada:

```text
PASS agent_chatwoot
PASS agent_chatwoot.health ...
PASS agent_chatwoot.readiness ...
PASS agent_chatwoot.signed_chatwoot_webhook ...
PASS evolutionapi
PASS evolutionapi.evolution_instance_connection ...
```

Se `SEND_EVOLUTION_TEST_MESSAGE=true`, tambem inclui:

```text
PASS evolutionapi.evolution_send_test_message ...
```

## Variaveis Necessarias

O comando exige o conjunto combinado:

```text
AGENT_BASE_URL
CHATWOOT_WEBHOOK_SECRET
SMOKE_CHATWOOT_CONVERSATION_ID
SMOKE_CHATWOOT_ACCOUNT_ID
SMOKE_CHATWOOT_INBOX_ID
SMOKE_CHATWOOT_CONTACT_ID
EVOLUTION_API_URL
EVOLUTION_API_KEY
WHATSAPP_INSTANCE
```

O envio real para WhatsApp continua opt-in:

```text
SEND_EVOLUTION_TEST_MESSAGE=true
TEST_WHATSAPP_NUMBER=5511999999999
```

## Testes Automatizados

O teste unitario cobre:

- sucesso quando agent/Chatwoot e EvolutionAPI passam;
- falha quando agent/Chatwoot falha;
- falha quando EvolutionAPI nao esta conectada.

## Validacoes Executadas

```bash
npm test -- tests/unit/full-flow-smoke.test.ts
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
full-flow-smoke: 3 testes passando
testes completos: 240 testes, 27 suites, tudo passando
coverage: 84.67% statements, 76.04% branches, 89.80% functions, 85.38% lines
lint: passou
typecheck: passou
build: passou
npm audit --omit=dev: 0 vulnerabilidades
docker compose config: passou
docker build: passou
```

## Estado Atual da Producao Real

O projeto agora tem validadores automatizados para quase toda a prontidao tecnica local e staging:

```bash
npm run smoke:staging
npm run smoke:evolution
npm run smoke:full-flow
```

Ainda resta uma unica prova que nao pode ser feita sem ambiente externo real:

```text
Enviar uma mensagem real pelo WhatsApp e confirmar que a resposta volta ao tutor via EvolutionAPI/Chatwoot.
```

Essa prova final deve ser registrada com:

- numero de teste;
- horario do teste;
- conversation id no Chatwoot;
- resultado do `npm run smoke:full-flow`;
- evidência de recebimento da resposta no WhatsApp.

*Registro criado em 2026-05-27.*
