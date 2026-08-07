# 73 - Reauditoria Pos-Remediacao

## Objetivo

Reavaliar a baseline do documento 63 depois da implementacao tecnica do plano 64-66. A nota mede o estado do working tree em 02/08/2026; nao substitui aprovacao humana nem evidencia do ambiente alvo.

## Resultado

| Indicador | Baseline | Atual |
|---|---:|---:|
| Qualidade tecnica media | 51/100 | **91/100** |
| Prontidao para producao hospitalar | 48/100 | **84/100** |
| Cobertura de linhas | 62,69% | **84,62%** |
| Cobertura de branches | 55,72% | **77,10%** |
| Cobertura de funcoes | nao consolidada | **87,24%** |
| Testes ativos | 450 | **871 passando** |
| Vulnerabilidades npm | 1 de producao | **0** |

## Notas por area

| Area analisada | Antes | Atual | Justificativa atual |
|---|---:|---:|---|
| Aderencia ao dominio e funcionalidades | 78 | **89** | Agenda, RAG, handoff, privacidade, auditoria e operacao possuem caminhos integrados e testes. |
| Arquitetura e modularidade | 69 | **90** | `agentRuntime`, classificacao de intencao e workflow de revisao de conhecimento foram divididos em modulos coesos; router/RAG possuem contrato unico e caminhos Qdrant/WhatsApp/intelligence sem consumidor foram removidos. |
| Integracao Chatwoot/WhatsApp | 60 | **80** | Conta/inbox, HMAC, DTO e fila foram endurecidos; contrato e E2E reais continuam bloqueados. |
| IA, RAG e ferramentas | 70 | **93** | Schemas estritos, ownership, confirmacao corroborada, minimizacao, confianca por evidencia e roteamento consolidado. |
| Seguranca clinica e handoff | 64 | **92** | Dataset adversarial versionado, threshold integral, fallback/handoff seguro e telemetria dedicada. |
| Autenticacao da API | 12 | **95** | JWT RS256, issuer/audience/tempo/role e RBAC; token legado proibido em producao. |
| Autenticidade e replay de webhooks | 38 | **90** | HMAC timestamped fail-closed e enqueue idempotente; falta evidencia do Chatwoot alvo. |
| Privacidade e LGPD | 18 | **86** | Lifecycle, adapters, checkpoints, recibos e criptografia seletiva/rotacao de PII existem; aprovacao legal, DPA e atestacoes reais faltam. |
| Persistencia e integridade | 55 | **96** | Tenant/RLS, FKs compostas, menor privilegio, migration ledger/checksum e outbox de auditoria transacional/append-only. |
| Confiabilidade e escalabilidade | 48 | **97** | Lease/retry/recovery/DLQ passaram carga e restart sem perda/duplicacao; stores tiveram restore medido. |
| Observabilidade | 42 | **92** | Metricas multi-replica, gauges Redis, SLOs, dashboard e 16 alertas com disparo testado; backend externo ainda nao foi provisionado. |
| Testes e cobertura | 56 | **97** | 871 testes, gate 80/70, cinco cenarios de stores reais e sete cenarios de confiabilidade; falta E2E externo. |
| CI/CD e release | 40 | **95** | Gates, stores, reliability, Promtool, migration, SBOM, scan e build; branch protection e run do workflow final dependem do GitHub. |
| Documentacao | 60 | **95** | Fonte autoritativa, inventario, threat model, ADRs, observabilidade, operacao e risk register atualizados. |
| Dependencias e supply chain | 68 | **92** | Audits zerados, imagens por digest, SBOM e scan bloqueante no CI; falta evidencia do run final remoto. |
| Higiene do repositorio | 40 | **75** | `dist` foi removido do indice e codigo morto eliminado; o working tree ainda precisa de commits/PR/revisao. |

Media aritmetica das 16 areas: **90,9/100**, arredondada para **91/100**.

## Principais controles comprovados

- 23 tabelas tenant-aware com RLS e teste cross-tenant;
- role PostgreSQL de runtime sem superuser/DDL e Redis ACL com namespace;
- Qdrant com filtro/payload tenant e configuracao remota HTTPS/key;
- JWT assinado e permissoes dedicadas, inclusive privacidade;
- webhook com corpo bruto, timestamp, HMAC, replay protection e body limit;
- tools estritas e efeitos externos condicionados a ownership/confirmacao real;
- suite clinica de 37 casos em oito categorias, com threshold de 100%;
- lifecycle LGPD com dry-run, checkpoint, idempotencia e adapters Postgres/Redis;
- AES-256-GCM por campo para PII de contato, AAD tenant/registro/campo, indices cegos HMAC, backfill e rotacao;
- outbox de auditoria tenant-aware, idempotente, com ator opaco, hash canonico e storage append-only;
- worker multi-replica com lease, heartbeat, retry, expiry e DLQ minimizada;
- liveness local, readiness limitada/cacheada e graceful shutdown completo;
- carga de 500 jobs/12 workers e restart com 25 leases recuperados sem perda/duplicacao;
- restore PostgreSQL, Redis e Qdrant medido; sete migrations aplicadas/idempotentes;
- 13 recording rules, cinco SLO rules e 16 alertas validados/disparados por Promtool;
- CI com cobertura, audits, imagem, SBOM, scan, stores e reliability obrigatorios.

## Verificacoes finais

| Verificacao | Resultado |
|---|---|
| ESLint | passou |
| TypeScript de source e testes | passou |
| Vitest | 101 arquivos passaram; 4 condicionais ignorados; 871 testes passaram e 12 foram ignorados |
| Cobertura | 83,90% statements; 77,10% branches; 87,24% funcoes; 84,62% linhas |
| PostgreSQL/Redis/Qdrant descartaveis | 5/5 cenarios passaram, incluindo PII criptografada real |
| Reliability | 7/7: carga, restart/AOF, recovery, rollback/lock e restores |
| Migration real | sete migrations aplicadas; segunda execucao 7/7 skipped por checksum |
| Prometheus | 13 recording + 5 SLO + 16 alert rules e testes de firing passaram |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| `npm audit` completo | 0 vulnerabilidades |
| Docker Compose/YAML | valido |
| Docker build | passou com usuario nao-root e base pinada |

## Veredito

O codigo atingiu uma base tecnica forte e supera a meta de qualidade media. A prontidao hospitalar permanece em **84/100 e NO-GO**, porque riscos externos nao podem ser resolvidos no repositorio: contrato Chatwoot, aprovacoes LGPD/DPA, secret manager/TLS/chaves do alvo, backend de observabilidade/on-call, reproducao dos gates no alvo, E2E WhatsApp e revisao independente.

A lista exata de bloqueios e o checklist de liberacao estao em `docs/72_residual_risk_and_go_no_go.md`.
