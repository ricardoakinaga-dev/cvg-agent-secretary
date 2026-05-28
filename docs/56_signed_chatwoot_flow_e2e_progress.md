# 56 - Fluxo Chatwoot Assinado e E2E Local

## Objetivo

Registrar a melhoria local do fluxo critico:

```text
Chatwoot webhook assinado -> agent-secretary -> RAG -> IA -> Chatwoot response
```

Essa validacao nao substitui o teste externo com WhatsApp/EvolutionAPI reais, mas prova localmente que o endpoint real, middleware de assinatura e runtime real trabalham juntos.

## Melhorias Executadas

### E2E local do webhook Chatwoot

Foi criado o teste:

```text
tests/unit/app-chatwoot-flow.test.ts
```

O teste sobe o `app` Express real em porta dinamica e envia:

- payload `message_created`;
- assinatura HMAC valida em `x-chatwoot-signature`;
- mensagem incoming de tutor;
- conversa e contato Chatwoot simulados.

O teste usa mocks apenas para dependencias externas:

- Redis;
- Chatwoot API;
- AI router;
- knowledge retrieval;
- analytics;
- contexto/memoria;
- scheduling state;
- DB/rotas administrativas.

Fluxo validado:

1. webhook assinado e aceito;
2. runtime deduplica mensagem;
3. runtime consulta base de conhecimento;
4. runtime marca estado de agendamento;
5. runtime chama IA;
6. runtime envia resposta ao Chatwoot;
7. analytics registra `message_received` e `response_sent`.

### Rate limit IPv6-safe

Durante o teste, o `express-rate-limit` alertou que o `keyGenerator` customizado usava `req.ip` diretamente, o que pode permitir bypass por enderecos IPv6.

Foi corrigido em:

```text
src/middleware/rate-limit.ts
```

Agora os key generators usam:

```text
ipKeyGenerator(req.ip || 'unknown')
```

Mantendo os identificadores preferenciais:

- `x-correlation-id` para `/api`;
- `x-chatwoot-account-id` para webhooks.

## Validacoes Executadas

```bash
npm test -- tests/unit/app-chatwoot-flow.test.ts
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
app-chatwoot-flow: passou
lint: passou
typecheck: passou
coverage: passou
testes completos: 225 testes, 24 suites, tudo passando
build: passou
npm audit --omit=dev: 0 vulnerabilidades
docker compose config: passou
docker build: passou
```

Cobertura atual:

```text
84.52% statements
74.91% branches
89.72% functions
85.15% lines
```

## Impacto no Plano 42

Este teste reforca o item P5:

```text
E2E Chatwoot - webhook -> IA -> resposta Chatwoot
```

Estado atual:

```text
E2E local com app real e dependencias externas mockadas: concluido
E2E externo com Chatwoot/EvolutionAPI/WhatsApp reais: pendente de ambiente/credenciais
```

## Pendencia Restante

Ainda falta executar em staging/producao:

```text
Tutor -> WhatsApp -> EvolutionAPI -> Chatwoot -> agent-secretary -> Chatwoot -> EvolutionAPI -> WhatsApp
```

Essa prova exige:

- instancia EvolutionAPI real;
- inbox/canal Chatwoot real;
- `CHATWOOT_WEBHOOK_SECRET` configurado com o mesmo segredo no Chatwoot e no agent;
- URL publica do webhook;
- credenciais reais de Chatwoot;
- pelo menos uma conversa de teste via WhatsApp.

*Registro criado em 2026-05-27.*
