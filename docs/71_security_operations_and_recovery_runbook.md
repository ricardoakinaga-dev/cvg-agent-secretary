# 71 - Runbook de Seguranca, Operacao e Recuperacao

## Objetivo

Operar, atualizar e recuperar o agente sem expor dados, perder jobs ou ampliar privilegios. Este runbook complementa os procedimentos de privacidade dos documentos 68 e 69.

## Pre-deploy

1. Confirmar branch/commit aprovados e gates verdes: lint, typecheck, testes, cobertura 80/70, build, audits, migration e scan da imagem.
2. Conferir secrets no secret manager; nunca copiar `.env.example` para producao.
3. Confirmar JWT issuer/audience/chave, conta e inbox Chatwoot, HMAC e URLs TLS.
4. Validar role PostgreSQL sem superuser/DDL, Redis ACL e Qdrant API key.
5. Criar e testar checkpoint de Postgres/Redis/Qdrant; registrar ID, horario, tenant e RPO/RTO.
6. Executar migration em banco descartavel e depois no alvo com a identidade de migracao.
7. Em primeira ativacao de criptografia ou rotacao de chave, manter chave antiga na key ring, executar `npm run pii:backfill` e comprovar zero contatos pendentes antes de iniciar a aplicacao.
8. Manter release anterior e procedimento de rollback disponiveis.

## Deploy

1. Drenar a replica anterior ou impedir novo trafego no proxy.
2. Executar `npm run migrate`/job equivalente uma unica vez; checksum divergente bloqueia o deploy.
3. Subir a nova imagem pinada e aguardar `GET /health` e `GET /ready`.
4. Liberar trafego gradualmente e observar queue age, retries, DLQ, erros, latencia, handoff e dependencias.
5. Executar webhook assinado de smoke com conta/inbox de teste.
6. Registrar imagem, SBOM, migration ledger, horario e aprovadores.

## Rollback de aplicacao

1. Interromper entrada se houver duplicacao, mistura de tenant, falha de auth ou risco clinico.
2. Drenar/restituir leases; nao apagar pending, inflight, delayed ou DLQ.
3. Reimplantar a imagem anterior. Migracoes deste ciclo sao expansivas; nao executar SQL destrutivo improvisado.
4. Validar health/readiness e reprocessar somente jobs idempotentes.
5. Se o schema novo impedir a versao anterior, restaurar em ambiente isolado e seguir plano de migracao revisado.

## Backup e restore

- Postgres: backup criptografado, restore em instancia isolada, validacao de contagens, FKs, RLS e tenant.
- Redis: snapshot/AOF coerente; validar pending/inflight/leases/delayed/DLQ e TTLs antes da promocao.
- Qdrant: snapshot por collection; validar payload `tenant_id` e contagem antes de reconectar.
- Auditoria: preservar `schema_migrations`, `audit_outbox`, `audit_events`, IDs de operacao e hashes de comprovantes; eventos legados sem hash permanecem marcados como nao verificados.

Um restore so e considerado testado quando a aplicacao usa a role de runtime, os testes cross-tenant passam e RPO/RTO medidos sao anexados ao ticket.

## Rotacao de secrets

| Secret | Procedimento minimo |
|---|---|
| JWT | publicar nova chave, aceitar sobreposicao controlada no IdP/gateway, trocar aplicacao, revogar antiga e testar issuer/audience |
| Chatwoot API/HMAC | criar novo segredo, atualizar ambos os lados em janela coordenada, testar webhook e revogar antigo |
| PostgreSQL | criar credencial da role app, atualizar secret, reciclar pool, testar privilegios negativos e revogar anterior |
| Redis | criar/alterar usuario ACL, atualizar secret, reciclar conexoes, testar namespace e revogar anterior |
| Qdrant | emitir key de menor privilegio, atualizar, testar collection/tenant e revogar anterior |
| IA | emitir key com quota/escopo, atualizar, testar minimizacao e revogar anterior |
| PII de contatos | adicionar nova chave a key ring, marcar como ativa, executar backfill/rotacao, comprovar leitura e zero pendencias, reciclar replicas e somente entao retirar a chave antiga |

Nunca registrar o valor antigo/novo em ticket, log, CLI compartilhado ou output do CI.

Para gerar chaves de 32 bytes, use o mecanismo criptografico do secret manager. Configure `PII_ENCRYPTION_KEYS_JSON` como mapa `key-id -> base64`, `PII_ACTIVE_KEY_ID` como chave de escrita e `PII_LOOKUP_KEY` como chave independente. A chave de lookup nao deve ser rotacionada sem reconstruir todos os indices cegos. Em caso de perda de uma chave de dados, interrompa o servico: remover a chave antes da rotacao torna os registros antigos irrecuperaveis.

## Incidentes

### Severidade critica

- mistura ou acesso cross-tenant;
- bypass de identidade/assinatura;
- resposta clinica proibida com risco imediato;
- perda/duplicacao de efeito externo;
- exposicao de segredo ou PII.

### Resposta

1. Conter: bloquear entrada, desabilitar tools/privacidade ou retirar o servico do proxy.
2. Preservar: correlation IDs, audit IDs, metricas e snapshots sem copiar payloads para canais indevidos.
3. Erradicar: revogar credenciais, corrigir policy/config/codigo e bloquear reprocessamento inseguro.
4. Recuperar: restaurar, validar tenants e executar suites clinica/integracao/E2E.
5. Comunicar: acionar Security/Privacy Owner, DPO e operacao conforme plano legal aprovado.
6. Encerrar: post-mortem, risco residual, teste de regressao e atualizacao deste runbook.

## Alertas minimos

- idade da fila acima do SLO;
- qualquer DLQ nova ou crescimento continuo;
- retries/erros de webhook e provedor;
- readiness indisponivel;
- falha de auditoria, migration ou privacidade;
- handoff/emergencia sem confirmacao operacional;
- taxa clinica/eval abaixo do threshold;
- expiracao proxima de certificado/secret/checkpoint.

O backend externo, thresholds finais e owners dos alertas devem ser preenchidos no registro de go/no-go.

## Gate automatizado de confiabilidade

Execute `bash scripts/run-reliability-gate.sh` somente em ambiente descartavel. O script valida migrations concorrentes/rollback, role e RLS, carga de fila, deduplicacao, restart com leases, replay AOF, restore integral de PostgreSQL, restore logico Redis e snapshot Qdrant. Evidencias estruturadas ficam em `coverage/reliability/*.json` e o CI as publica como artifact.

A medicao local de 02/08/2026 comprovou 500 jobs/12 workers sem perda ou duplicacao, 25/25 leases recuperados, RPO superior medido de 1,5 s no checkpoint Redis, restore PostgreSQL/Qdrant/Redis dentro de 2 s e rollback de migration sem escrita parcial. Esses numeros comprovam o desenho descartavel; os SLOs e o ensaio no ambiente alvo ainda exigem aprovacao operacional.

O usuario Redis `default` deve permanecer autenticado, habilitado e restrito a `cvg:*` mais comandos minimos de replay AOF (`read/write/select/multi/exec`). Desabilita-lo faz o loader AOF rejeitar transacoes Lua e pode perder a fila no restart. O usuario nomeado da aplicacao continua sendo a identidade normal de runtime.
