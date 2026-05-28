# 58 - Smoke Test EvolutionAPI

## Objetivo

Adicionar uma verificacao executavel para a camada EvolutionAPI/WhatsApp, fechando mais uma parte da pendencia externa do fluxo:

```text
Tutor -> WhatsApp -> EvolutionAPI -> Chatwoot -> agent-secretary -> Chatwoot -> EvolutionAPI -> WhatsApp
```

Como o runtime principal responde via Chatwoot, este smoke test nao substitui o fluxo completo. Ele valida a conectividade direta com a EvolutionAPI e, opcionalmente, o envio de mensagem para um numero de teste.

## Arquivos Criados

```text
src/modules/readiness/evolutionSmoke.ts
src/scripts/evolution-smoke.ts
tests/unit/evolution-smoke.test.ts
```

## Comando Adicionado

```bash
npm run smoke:evolution
```

## Variaveis Necessarias

```text
EVOLUTION_API_URL
EVOLUTION_API_KEY
WHATSAPP_INSTANCE
```

Variaveis opcionais para envio controlado:

```text
SEND_EVOLUTION_TEST_MESSAGE=false
TEST_WHATSAPP_NUMBER=
EVOLUTION_TEST_MESSAGE=Teste automatico EvolutionAPI -> WhatsApp.
SMOKE_TIMEOUT_MS=10000
```

O envio de mensagem fica desativado por padrao para evitar disparo acidental.

## O Que o Smoke Test Valida

1. `GET /instance/connectionState/{WHATSAPP_INSTANCE}`
   - exige HTTP 2xx;
   - exige estado `open` no payload (`instance.connectionStatus`, `instance.state` ou `state`).

2. `POST /message/sendText/{WHATSAPP_INSTANCE}` opcional
   - executado apenas quando `SEND_EVOLUTION_TEST_MESSAGE=true`;
   - exige `TEST_WHATSAPP_NUMBER`;
   - envia mensagem de teste configuravel.

## Testes Automatizados

O teste unitario cobre:

- instancia conectada;
- instancia nao aberta;
- envio opcional de mensagem;
- garantia de que mensagem nao e enviada sem opt-in;
- falha segura quando opt-in esta ativo sem numero;
- leitura de variaveis de ambiente;
- erro claro para variaveis obrigatorias ausentes.

## Validacoes Executadas

```bash
npm test -- tests/unit/evolution-smoke.test.ts
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
evolution-smoke: 7 testes passando
testes completos: 237 testes, 26 suites, tudo passando
coverage: 84.62% statements, 75.18% branches, 89.75% functions, 85.33% lines
lint: passou
typecheck: passou
build: passou
npm audit --omit=dev: 0 vulnerabilidades
docker compose config: passou
docker build: passou
```

## Uso em Staging

Somente conectividade:

```bash
EVOLUTION_API_URL=https://evolution.example.com \
EVOLUTION_API_KEY=*** \
WHATSAPP_INSTANCE=cvg \
npm run smoke:evolution
```

Com envio controlado:

```bash
EVOLUTION_API_URL=https://evolution.example.com \
EVOLUTION_API_KEY=*** \
WHATSAPP_INSTANCE=cvg \
SEND_EVOLUTION_TEST_MESSAGE=true \
TEST_WHATSAPP_NUMBER=5511999999999 \
EVOLUTION_TEST_MESSAGE="Smoke test CVG" \
npm run smoke:evolution
```

## Estado Atual da Prova Externa

Agora existem dois comandos para staging:

```bash
npm run smoke:staging
npm run smoke:evolution
```

Eles validam:

- agent publico;
- `/health`;
- `/ready`;
- webhook Chatwoot assinado;
- EvolutionAPI conectada;
- envio opcional EvolutionAPI -> WhatsApp.

A prova final completa ainda deve ser executada com uma conversa real no WhatsApp, porque somente ela confirma que Chatwoot e EvolutionAPI estao roteando a conversa real de ida e volta.

*Registro criado em 2026-05-27.*
