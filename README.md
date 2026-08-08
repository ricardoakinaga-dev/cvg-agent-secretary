# CVG Secretary Agent

Agente de atendimento do Centro Veterinário Guarapiranga, integrado ao Chatwoot, PostgreSQL, Redis, Qdrant e provedores de IA.

O runtime recebe webhooks assinados do Chatwoot, valida conta e inbox, enfileira o DTO no Redis e processa a conversa de forma assíncrona. O agente usa conhecimento institucional publicado, ferramentas de agenda, handoff humano e guardrails clínicos.

## Estado atual

O projeto inclui:

- autenticação operacional por JWT RS256 e RBAC;
- webhook HMAC com timestamp, replay protection e validação estrita;
- fila Redis com lease, heartbeat, retry atrasado, DLQ limitada e correlation ID;
- persistência tenant-aware com RLS em PostgreSQL;
- RAG PostgreSQL/Qdrant com isolamento por tenant;
- recepção estruturada por perfil e motivo, com coleta mínima e contexto persistido;
- minimização de dados antes de OpenAI/OpenRouter;
- agenda com ownership e confirmação corroborada pelo turno do usuário;
- handoff, auditoria, métricas, readiness e graceful shutdown;
- suíte determinística de segurança clínica e CI com audit/SBOM.
- API de privacidade governada por policy, checkpoint, RBAC e comprovantes auditáveis.

A fonte de verdade da prontidão atual é:

- [Auditoria atual](docs/76_current_production_readiness_audit.md)
- [Plano executivo](docs/77_executive_production_readiness_plan.md)
- [Roadmap](docs/78_production_readiness_roadmap.md)
- [Backlog rastreável](docs/79_production_readiness_backlog.md)

O estado atual permanece **NO-GO para atendimento autônomo de clientes reais**
até a homologação externa do fluxo Chatwoot/EvolutionAPI/WhatsApp, dos
secrets/TLS/rede, da privacidade e da operação.

## Requisitos

- Node.js 20.19+ (ou versão compatível definida em `package.json`)
- Docker Compose, ou PostgreSQL 15+/Redis 7+/Qdrant provisionados separadamente
- conta e credenciais do Chatwoot
- credencial OpenAI e, opcionalmente, OpenRouter
- par de chaves/IdP capaz de emitir JWT RS256 para a API operacional

## Desenvolvimento local

```bash
cp .env.example .env
npm ci
npm run typecheck
npm test
npm run dev
```

Para verificar artefatos exportados antes de compartilhá-los:

```bash
npm run security:scan-artifacts -- .env.example package.json
```

Os valores de `.env.example` são exemplos e não devem ser usados em produção.

## Execução com Compose

Preencha no `.env`, no mínimo, as credenciais distintas de migração/aplicação PostgreSQL, a identidade ACL do Redis, Chatwoot, JWT, IA e Qdrant. Em seguida:

```bash
docker compose config
docker compose up --build
```

O Compose:

- cria uma role PostgreSQL de aplicação sem DDL/superuser;
- protege Redis com usuário, senha e escopo de chaves `cvg:*`;
- executa migrations com lock, checksum e ledger;
- vincula a porta da aplicação a `127.0.0.1:3023` para uso atrás de proxy TLS.

Para stores externos, produção exige transporte TLS verificado. `ALLOW_INSECURE_PRIVATE_STORES=true` deve ser usado somente em rede privada comprovada, como a rede interna do Compose.

## Migrations

Depois do build:

```bash
npm run build
MIGRATION_DATABASE_URL='postgresql://...' CHATWOOT_ACCOUNT_ID=1 npm run migrate
```

O runner aplica apenas arquivos `YYYYMMDD_nome.sql`, em ordem, com advisory lock, checksum e transação. Uma migration já aplicada com conteúdo alterado falha fechada.

## Configuração principal

| Variável | Finalidade |
|---|---|
| `DATABASE_URL` | Conexão da role de aplicação |
| `MIGRATION_DATABASE_URL` | Conexão privilegiada usada somente pelo job de migration |
| `ALLOW_INSECURE_PRIVATE_STORES` | Exceção explícita para rede privada sem TLS |
| `REDIS_URL`, `REDIS_USERNAME`, `REDIS_PASSWORD` | Store distribuído, fila e rate limit |
| `CHATWOOT_API_URL`, `CHATWOOT_API_TOKEN` | API Chatwoot |
| `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_IDS` | Fronteira de tenant e allowlist de inbox |
| `CHATWOOT_WEBHOOK_SECRET` | HMAC obrigatório do webhook |
| `API_JWT_PUBLIC_KEY`, `API_JWT_ISSUER`, `API_JWT_AUDIENCE` | Identidade assinada da API |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Provedor primário |
| `AI_PROVIDER`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Roteamento/fallback opcional |
| `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` | Vector store |
| `TRUST_PROXY_HOPS` | Número explícito de proxies confiáveis |
| `PRIVACY_ENABLED` | Ativa API de privacidade somente após aprovação formal |
| `PRIVACY_RETENTION_POLICIES_JSON` | Policies versionadas de retenção/expurgo |
| `PRIVACY_RECOVERY_CHECKPOINTS_JSON` | Catálogo de checkpoints verificados por tenant |
| `PRIVACY_QDRANT_ATTESTATION_ID`, `PRIVACY_LOGS_ATTESTATION_ID` | Atestações versionadas de ausência de PII |
| `PII_ENCRYPTION_REQUIRED`, `PII_ACTIVE_KEY_ID` | Ativação obrigatória em produção e ID da chave AES-256-GCM de escrita |
| `PII_ENCRYPTION_KEYS_JSON`, `PII_LOOKUP_KEY` | Key ring base64 e chave HMAC separada, fornecidas pelo secret manager |

Consulte `.env.example` para a lista completa e limites.

Após aplicar a migration de criptografia, proteja os registros legados (ou regrave com a nova chave ativa) antes de subir as replicas:

```bash
npm run build
PII_ENCRYPTION_REQUIRED=true npm run pii:backfill
```

## Endpoints

| Endpoint | Acesso | Uso |
|---|---|---|
| `GET /health` | local/orquestrador | liveness sem chamadas externas |
| `GET /ready` | orquestrador | readiness cacheada de PostgreSQL/Redis |
| `POST /webhooks/chatwoot` | HMAC Chatwoot | entrada assíncrona |
| `/api/knowledge/*` | JWT + RBAC | curadoria e publicação |
| `/api/scheduling/*` | JWT + RBAC | administração da agenda |
| `GET /api/analytics/dashboard` | JWT + `analytics:read` | painel operacional |
| `GET /api/audit/events` | JWT + `audit:read` | trilha de auditoria |
| `GET /api/metrics?format=prometheus` | JWT + `analytics:read` | scrape Prometheus/OpenMetrics |
| `/api/privacy/*` | JWT + `privacy:read/delete` | retenção e direitos do titular; desativado sem policy aprovada |

## Qualidade

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run test:integration:stores
npm run build
npm audit --omit=dev --audit-level=low
npm run sbom > sbom.cdx.json
```

A cobertura bloqueia abaixo de 80% de linhas, 80% de funções ou 70% de branches. A suíte clínica em `tests/evals/` roda junto com os testes normais. A integração de stores exige o ambiente descartável descrito no CI. Testes de staging e WhatsApp exigem ambiente e credenciais reais; veja os scripts `smoke:*` e os runbooks em `docs/`.

## Segurança operacional

- Nunca use os segredos de exemplo.
- Não habilite `ALLOW_LEGACY_API_TOKEN` em produção.
- Não exponha a porta Node diretamente à internet; use proxy TLS e configure `TRUST_PROXY_HOPS`.
- Faça rotação de JWT, Chatwoot, Redis, PostgreSQL, Qdrant e provedores de IA conforme o runbook.
- Um smoke interno não substitui a homologação E2E no Chatwoot/WhatsApp real.

## Licença

Proprietário — Centro Veterinário Guarapiranga.
