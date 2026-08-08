## Objetivo e escopo

- Mudanca solicitada:
- Owner da mudanca:
- Revisor independente (quando P0/P1):
- Risco residual e decisao de aceite:

## Evidencias tecnicas

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test -- --reporter=dot`
- [ ] `npm run build`
- [ ] `git diff --check`
- [ ] Evidencia de teste, carga, restart, restore ou smoke anexada quando aplicavel
- [ ] `promtool` executado no CI quando regras de observabilidade mudaram
- [ ] Nenhum segredo, PII ou dado de cliente foi incluido no diff/artefato

## Dados, migracoes e efeitos externos

- [ ] Migracoes possuem caminho de rollback e foram testadas em ambiente descartavel
- [ ] O efeito externo e idempotente, reconciliavel ou explicitamente inexistente
- [ ] O estado canonico continua no PostgreSQL; Redis permanece cache/lease
- [ ] Chatwoot confirma mensagens recebidas antes do processamento quando o gate exige
- [ ] Alteracoes de handoff permanecem fail-closed e auditaveis
- [ ] Retencao, exportacao, anonimização e apagamento de PII foram revisados

## Release e operacao

- [ ] Runbook e alarmes atualizados
- [ ] Owner de on-call e canal de incidente definidos para mudancas operacionais
- [ ] A matriz E2E foi executada no staging quando o fluxo externo mudou
- [ ] Esta PR nao e uma aprovacao de go-live; a decisao formal esta registrada nos documentos 77-79

## Links de evidencia

- CI:
- Relatorio/runbook:
- Risco ou incidente relacionado:
