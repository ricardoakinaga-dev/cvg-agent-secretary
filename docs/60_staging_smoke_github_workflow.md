# 60 - Workflow Manual de Smoke em Staging

## Objetivo

Adicionar uma forma operacional de rodar a validacao externa pelo GitHub Actions quando o ambiente de staging/producao estiver disponivel.

## Arquivo Criado

```text
.github/workflows/staging-smoke.yml
```

## Como Executar

O workflow e manual:

```text
Actions -> Staging Smoke -> Run workflow
```

Inputs:

```text
send_evolution_test_message: false | true
strict_health: true | false
```

Por seguranca, o envio real via EvolutionAPI/WhatsApp fica desligado por padrao.

## O Que o Workflow Executa

```bash
npm ci
npm run smoke:full-flow
```

O comando `smoke:full-flow` valida:

- `GET /health`;
- `GET /ready`;
- `POST /webhooks/chatwoot` com assinatura HMAC valida;
- `GET /instance/connectionState/{WHATSAPP_INSTANCE}` na EvolutionAPI;
- envio opcional de mensagem real pela EvolutionAPI, se habilitado no input.

## Secrets Necessarios

```text
STAGING_AGENT_BASE_URL
STAGING_CHATWOOT_WEBHOOK_SECRET
STAGING_CHATWOOT_CONVERSATION_ID
STAGING_CHATWOOT_ACCOUNT_ID
STAGING_CHATWOOT_INBOX_ID
STAGING_CHATWOOT_CONTACT_ID
STAGING_EVOLUTION_API_URL
STAGING_EVOLUTION_API_KEY
STAGING_WHATSAPP_INSTANCE
```

Secrets opcionais:

```text
STAGING_CHATWOOT_CONTACT_NAME
STAGING_SMOKE_MESSAGE_CONTENT
STAGING_TEST_WHATSAPP_NUMBER
STAGING_EVOLUTION_TEST_MESSAGE
```

Quando `send_evolution_test_message=true`, `STAGING_TEST_WHATSAPP_NUMBER` passa a ser obrigatorio.

## Segurança

- Nenhum segredo foi hardcoded.
- O workflow usa apenas `secrets.*`.
- Envio real de WhatsApp exige opt-in manual.
- O job tem `timeout-minutes: 10`.
- O workflow falha antes de rodar se variaveis obrigatorias estiverem ausentes.

## Validacoes Locais Executadas

```bash
node -e "const fs=require('fs'); const YAML=require('yaml'); for (const f of ['.github/workflows/ci.yml','.github/workflows/staging-smoke.yml']) { YAML.parse(fs.readFileSync(f,'utf8')); console.log('parsed '+f); }"
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
docker compose --env-file .env.example config
```

Resultado:

```text
workflow YAML: parse OK
lint: passou
typecheck: passou
testes completos: 240 testes, 27 suites, tudo passando
build: passou
npm audit --omit=dev: 0 vulnerabilidades
docker compose config: passou
```

## Estado Atual

A validacao de staging agora pode ser executada de duas formas:

Local:

```bash
npm run smoke:full-flow
```

GitHub Actions:

```text
Actions -> Staging Smoke -> Run workflow
```

A unica etapa que ainda depende de execucao real e confirmar visualmente/operacionalmente que uma mensagem enviada por um tutor no WhatsApp atravessa EvolutionAPI e Chatwoot e retorna ao WhatsApp com a resposta do agent.

*Registro criado em 2026-05-27.*
