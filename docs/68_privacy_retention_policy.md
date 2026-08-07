# 68 - Politica Tecnica de Retencao e Expurgo

## Estado

**Proposta tecnica; uso em producao bloqueado ate aprovacao formal.** Prazos clinicos, trabalhistas, fiscais, consumeristas e de auditoria nao podem ser inferidos pelo codigo. O Encarregado/DPO e o owner hospitalar devem aprovar uma versao com data e justificativa antes da integracao em `app.ts`.

## Registro de aprovacao obrigatorio

| Campo | Valor atual |
|---|---|
| Policy ID/versao | Pendente |
| Aprovador de privacidade | Pendente |
| Aprovador hospitalar | Pendente |
| Data de vigencia | Pendente |
| Bases/obrigacoes consideradas | Pendente |
| Excecoes/legal hold | Pendente |
| RPO/RTO e checkpoint de recuperacao | Pendente |

Sem todos esses campos, o servico nao deve receber uma lista de politicas de producao.

## Matriz a preencher

| Store/recurso | Dado | Prazo aprovado | Acao final | Excecao/legal hold | Evidencia |
|---|---|---:|---|---|---|
| PostgreSQL `messages` | conteudo de conversa | Pendente | eliminar ou anonimizar | Pendente | recibo de expurgo |
| PostgreSQL `conversation_summaries` | resumo e fatos | Pendente | eliminar | Pendente | recibo |
| PostgreSQL `customer_memories` | preferencias/contexto | Pendente | eliminar/anonimizar | Pendente | recibo do titular |
| PostgreSQL agenda/follow-up | dados operacionais | Pendente | anonimizar ou eliminar | obrigacao a validar | recibo |
| PostgreSQL analytics/feedback | consulta/resposta/metricas | Pendente | agregar e eliminar detalhe | Pendente | recibo |
| PostgreSQL auditoria | prova sem conteudo bruto | Pendente | preservar/expurgar conforme obrigacao | incidente/legal hold | trilha de auditoria |
| Redis fila/estado | DTO e conteudo temporario | Pendente | TTL e expurgo | job ativo | metricas Redis |
| Redis DLQ | DTO minimo de falha | Pendente | TTL e expurgo | incidente aberto | metrica DLQ |
| Qdrant | conhecimento institucional | Pendente | remover versao/tenant | publicacao em revisao | resultado do adapter |
| Logs | metadados redigidos | Pendente | lifecycle do backend | incidente/legal hold | configuracao do backend |
| Fornecedores de IA | contexto minimizado | Conforme contrato aprovado | exclusao pelo operador | obrigacao contratual | DPA/relatorio |

## Contrato codificado

O modulo `src/modules/privacy` implementa os seguintes controles:

- politicas injetadas e validadas: ID unico, store conhecido, recurso em allowlist, prazo de 1 a 3650 dias e lote de 1 a 10.000;
- nenhuma politica ou prazo juridico hardcoded como padrao de producao;
- dry-run tenant-aware, com cutoff, quantidade limitada por lote, hash da policy e comprovante;
- expurgo somente com `confirm: true` e recibo de dry-run concluido para o mesmo tenant e a mesma versao efetiva da policy;
- expurgo exige checkpoint validado por `PrivacyRecoveryAdapter`, criado antes do comprovante de dry-run;
- preflight de todos os stores participantes antes da primeira mutacao;
- SQL parametrizado e tabelas/colunas escolhidas exclusivamente por allowlist interna;
- `FOR UPDATE SKIP LOCKED` e transacao para cada lote PostgreSQL;
- idempotency key e ledger de auditoria com lock consultivo para impedir concorrencia duplicada;
- falha em qualquer store nao gera comprovante de sucesso e registra stores ja concluidos para reconciliacao.

## Procedimento de dry-run

1. Confirmar a policy aprovada e o tenant.
2. Confirmar backup/checkpoint recuperavel anterior ao cutoff e registrar seu ID no ticket operacional.
3. Chamar `POST /retention/preview` com idempotency key unica.
4. Comparar contagens com consultas independentes e verificar legal holds.
5. Anexar o receipt ID, evidence hash, cutoff, contagens e checkpoint ao ticket.
6. Obter aprovacao em quatro olhos para o expurgo.

## Procedimento de expurgo

1. Usar o receipt ID do dry-run aprovado.
2. Chamar `POST /retention/purge` com nova idempotency key, receipt ID e `confirm: true`.
3. Repetir em lotes ate o dry-run retornar zero, respeitando janela e SLO.
4. Conferir o comprovante final em `audit_events` e as metricas de cada store.
5. Executar nova exportacao/amostragem para confirmar ausencia do dado expirado.

## Recuperacao e rollback

Expurgo fisico nao possui rollback logico automatico. O rollback seguro depende de checkpoint/backup criptografado, testado e com acesso restrito. Se um lote afetar dados incorretos:

1. interromper novos lotes e bloquear a policy;
2. preservar `operationId`, receipt do preview e evento de falha;
3. restaurar o checkpoint em ambiente isolado;
4. selecionar somente tenant e registros do lote afetado;
5. revisar conflito/idempotencia antes de reintroduzir dados;
6. registrar incidente, validacao do owner e novo comprovante.

O gate PRV-002 continua aberto enquanto backup/restore real, metricas externas, legal hold e aprovacao dos prazos nao forem comprovados.

## Configuracao operacional implementada

As variaveis abaixo sao obrigatorias quando `PRIVACY_ENABLED=true`:

- `PRIVACY_RETENTION_POLICIES_JSON`: array de policies validadas;
- `PRIVACY_RECOVERY_CHECKPOINTS_JSON`: checkpoints verificados com tenant e horario;
- `PRIVACY_QDRANT_ATTESTATION_ID` e `PRIVACY_LOGS_ATTESTATION_ID`: atestacoes versionadas.

Redis suporta o recurso allowlisted `webhook_dlq`; PostgreSQL suporta somente as tabelas enumeradas no adapter. Recurso desconhecido falha fechado. Metricas `privacy_operations_*` registram sucesso, falha e latencia sem UUID do titular.

## Metricas e alertas minimos

- candidatos por policy/store;
- registros expurgados por lote;
- duracao e falhas por store;
- idade do registro mais antigo elegivel;
- operacoes iniciadas sem comprovante concluido;
- divergencia dry-run versus expurgo;
- DLQ acima do prazo ou sem TTL;
- falha de preflight, auditoria ou checkpoint.
