# 64 - Plano Executivo de Remediacao

## Objetivo

Elevar o projeto da nota atual de **48/100 em prontidao hospitalar** para uma condicao segura, operavel e auditavel de producao, resolvendo os achados registrados em `docs/63_current_project_code_audit.md`.

Este documento define estrategia, governanca, prioridades, criterios de decisao e gates. O calendario de execucao esta em `docs/65_remediation_roadmap.md` e a lista operacional de trabalho esta em `docs/66_remediation_backlog.md`.

## Resultado Executivo Esperado

Ao final do programa, o hospital deve ter um agente que:

- autentica operadores e servicos por identidade verificavel;
- aceita somente webhooks autenticos, recentes e da conta Chatwoot esperada;
- impede mistura de tutores, conversas, contas e dados clinicos;
- aplica minimizacao, retencao e eliminacao auditavel de dados pessoais;
- executa tools mutaveis somente com validacao e autorizacao server-side;
- transfere casos clinicos, emergencias e baixa confianca para humanos;
- opera com filas recuperaveis, shutdown seguro, health checks baratos e metricas externas;
- possui CI/CD reproduzivel e gates obrigatorios de seguranca, qualidade e migracao;
- comprova o fluxo real WhatsApp -> Chatwoot -> agente -> Chatwoot -> WhatsApp.

## Meta de Saida

| Indicador | Baseline | Meta minima |
|---|---:|---:|
| Prontidao hospitalar | 48/100 | **>= 85/100** |
| Achados P0 abertos | 8 grupos | **0** |
| Achados P1 sem plano aceito | Varios | **0** |
| Testes automatizados | 450 passando | Todos passando, sem comportamentos inseguros codificados |
| Cobertura de linhas | 62,69% | **>= 80%** sobre todos os modulos elegiveis |
| Cobertura de branches | 55,72% | **>= 70%** |
| Vulnerabilidades de producao | 1 baixa | 0 high/critical; demais corrigidas ou formalmente aceitas |
| E2E externo | Nao comprovado | 100% dos cenarios criticos aprovados em staging |
| Retencao de DLQ | Indefinida | TTL e expurgo comprovados |
| Identidade administrativa | Header autodeclarado | Claims assinadas e roles server-side |

A nota nao substitui os gates. Mesmo acima de 85, a liberacao continua proibida enquanto existir qualquer criterio de bloqueio nao atendido.

## Principios de Execucao

1. **Seguranca antes de funcionalidade nova:** congelar novas features ate fechar os bloqueadores P0.
2. **Fail closed:** falhas de identidade, conta, assinatura, auditoria ou validacao devem impedir a operacao sensivel.
3. **Menor dado necessario:** nao colocar em fila, log, banco ou provedor externo dados que nao sejam necessarios para a finalidade.
4. **Identidade deterministica:** nunca identificar tutor por nome; usar chaves verificadas e vinculadas a conta.
5. **Efeito externo confirmado:** agendamento, cancelamento, publicacao e notificacao exigem validacao server-side e confirmacao explicita do resultado.
6. **Evidencia automatizada:** cada correcao deve incluir teste que falha antes e passa depois.
7. **Uma fonte da verdade:** o backlog 66 controla status; roadmap e plano apenas referenciam seus IDs.
8. **Mudancas pequenas e reversiveis:** entregar por PRs independentes, com migracoes expansivas e rollback documentado.

## Decisoes Executivas Necessarias

### D1 - Operacao Single-Tenant ou Multi-Tenant

Decisao obrigatoria antes das alteracoes de schema.

- Se o produto atender somente uma conta, `account_id` ainda deve ser validado e persistido para impedir eventos cruzados.
- Se houver qualquer previsao de varias unidades ou contas, `tenant_id` deve fazer parte de todas as identidades, indices, filas, caches, credenciais e politicas de acesso.

Recomendacao: implementar o modelo tenant-aware agora, mesmo iniciando com um unico tenant.

### D2 - Provedor de Identidade

Escolher OIDC/JWT assinado, gateway corporativo ou mTLS para servicos. O token compartilhado pode permanecer apenas como mecanismo temporario e restrito a rede interna durante a migracao.

Recomendacao: OIDC/JWT para pessoas e credenciais de servico com claims assinadas para automacoes.

### D3 - Politica de Dados e IA

O hospital deve aprovar:

- finalidade e base legal por categoria de dado;
- prazos de retencao;
- procedimento de acesso, correcao, exportacao e eliminacao;
- quais dados podem ser enviados a OpenAI/OpenRouter;
- operadores, contratos, regiao, transferencia internacional e resposta a incidente.

Nenhuma decisao juridica deve ser inferida pelo time tecnico. O codigo implementara a politica aprovada pelo responsavel de privacidade.

### D4 - Topologia de Producao

Definir:

- numero de replicas;
- reverse proxy e terminacao TLS;
- Postgres, Redis e Qdrant gerenciados ou autogeridos;
- secret manager;
- plataforma de metricas, logs e alertas;
- objetivos de disponibilidade, RPO e RTO.

Recomendacao inicial: uma replica ate implementar leasing seguro; depois habilitar escala horizontal.

## Frentes de Trabalho

| Frente | Objetivo | Principais IDs do backlog |
|---|---|---|
| Governanca e baseline | Tornar escopo, ownership e release reproduziveis | GOV, REP |
| Identidade e autorizacao | Eliminar identidade autodeclarada e auditoria forjavel | IAM |
| Webhook e isolamento | Autenticar origem, conta, evento e contato | TEN, WHK |
| Privacidade e dados | Implementar minimizacao, retencao e direitos do titular | PRV, DAT |
| IA e seguranca clinica | Validar tools, calibrar confianca e ampliar avaliacoes | AI |
| Confiabilidade | Corrigir logger, worker, shutdown, health e configuracao | REL |
| Observabilidade e auditoria | Produzir telemetria duravel e sem PII | OBS |
| Qualidade e entrega | Cobertura real, testes de infraestrutura e CI/CD | TST, CICD, SUP |
| Documentacao | Consolidar fonte da verdade e runbooks | DOC |

## Sequencia de Execucao

### Onda 0 - Contencao e Baseline

Objetivo: impedir aumento do risco enquanto a remediacao e executada.

- congelar novas features;
- restringir o servico a rede controlada;
- operar com uma unica replica;
- registrar o working tree atual em branch/commit revisavel;
- nomear owners e aprovar decisoes D1-D4;
- estabelecer inventario de dados e risco.

### Onda 1 - Fronteiras de Confianca

Objetivo: garantir quem pode chamar o sistema e quais eventos podem entrar.

- nova autenticacao e RBAC;
- ator de auditoria derivado somente da identidade verificada;
- validacao de conta e inbox;
- remocao do fallback por nome;
- assinatura com timestamp, replay protection e idempotencia;
- schemas estritos, body limits e rate limiting confiavel.

### Onda 2 - Privacidade e Persistencia

Objetivo: controlar onde os dados ficam, por quanto tempo e quem os acessa.

- politica de retencao e jobs de expurgo;
- minimizacao de payloads e contexto de IA;
- Redis/Postgres/Qdrant com credenciais, TLS e privilegio minimo;
- eliminacao/anonimizacao auditavel;
- migracoes com ledger e rollback;
- backup e restore comprovados.

### Onda 3 - Seguranca Clinica e Confiabilidade

Objetivo: impedir efeitos indevidos e manter o processo operacional.

- validacao estrita por tool;
- confirmacoes deterministicas para efeitos externos;
- guardrails e suite adversarial;
- tratamento seguro de baixa confianca e input bloqueado;
- logger sem vazamento;
- worker com leasing e retries seguros;
- shutdown completo e health checks corretos.

### Onda 4 - Evidencia e Operacao

Objetivo: transformar controles em gates continuos.

- metricas externas, alertas e auditoria duravel;
- cobertura de todos os modulos elegiveis;
- testes com Redis/Postgres/Qdrant reais;
- CI na branch default;
- dependency scanning, SBOM e imagens fixadas;
- testes de carga, falha, recuperacao e restore.

### Onda 5 - Staging e Liberacao

Objetivo: comprovar o fluxo real antes de dados de producao.

- E2E com conta Chatwoot e numero WhatsApp de teste;
- cenarios de agenda, handoff, emergencia, replay e indisponibilidade;
- ensaio de rollback e incidente;
- revisao final de privacidade e seguranca;
- reauditoria e decisao formal go/no-go.

## Governanca

### Papeis Minimos

| Papel | Responsabilidade |
|---|---|
| Sponsor do hospital | Prioridade, risco aceito e decisao go/no-go |
| Tech Lead | Arquitetura, sequenciamento e qualidade tecnica |
| Security/Privacy Owner | Threat model, LGPD, fornecedores e riscos residuais |
| Backend Owner | Auth, dados, filas, tools e integracoes |
| Platform/DevOps Owner | CI/CD, secrets, TLS, observabilidade e restore |
| QA Owner | Estrategia de testes, E2E, regressao e evidencias |
| Operacao hospitalar | Validacao dos fluxos, textos, handoff e incidentes |

Uma pessoa pode acumular papeis em equipe pequena, mas nenhuma entrega P0 deve ser aprovada apenas pelo proprio autor.

### Cadencia

- daily tecnico curto para bloqueios P0;
- revisao semanal de riscos, metricas e dependencias;
- demonstracao ao final de cada fase;
- decisao de gate registrada no repositorio;
- reauditoria antes do go-live.

### Definition of Ready

Uma tarefa entra em desenvolvimento quando possui:

- owner;
- risco ou achado vinculado;
- criterio de aceite testavel;
- dependencias conhecidas;
- estrategia de migracao e rollback quando aplicavel;
- classificacao sobre PII e efeito externo.

### Definition of Done

Uma tarefa somente esta pronta quando:

- codigo e testes foram revisados por outra pessoa;
- lint, typecheck, testes e build passam;
- teste de seguranca/regressao relevante foi adicionado;
- logs nao expoem PII;
- migracao e rollback foram verificados quando aplicavel;
- documentacao e runbook foram atualizados;
- evidencias foram anexadas ao item do backlog;
- risco residual foi fechado ou formalmente aceito.

## Gates Obrigatorios

### Gate G0 - Baseline Reproduzivel

- working tree consolidado e revisado;
- branch default e CI alinhados;
- arquivos centrais rastreados;
- build reproduzivel a partir de checkout limpo;
- owners e decisoes D1-D4 registrados.

### Gate G1 - Entrada Confiavel

- identidade e roles assinadas;
- ator nao controlavel por body/header arbitrario;
- conta/inbox validadas;
- fallback por nome removido;
- webhook falha fechado;
- replay e duplicacao rejeitados por testes.

### Gate G2 - Dados Governados

- inventario e politica aprovados;
- TTL e expurgo ativos;
- eliminacao/anonimizacao testadas;
- stores usam privilegio minimo e transporte seguro;
- contexto de IA minimizado;
- logs avaliados sem PII bruta.

### Gate G3 - Runtime Resiliente

- logger sem crescimento de listeners;
- worker seguro para a topologia aprovada;
- shutdown fecha HTTP, worker, Redis e Postgres;
- liveness e readiness separadas;
- tools mutaveis validadas e autorizadas;
- suite clinica/adversarial aprovada.

### Gate G4 - Release Candidate

- lint, typecheck, build e testes verdes;
- cobertura de linhas >= 80% e branches >= 70%;
- `npm audit --omit=dev` sem high/critical e demais riscos tratados;
- testes de infraestrutura, migracao e restore aprovados;
- SBOM e imagens fixadas;
- observabilidade e alertas operacionais.

### Gate G5 - Producao

- E2E externo completo com evidencias;
- teste de replay, conta errada, contato homonimo e indisponibilidade aprovado;
- carga e recuperacao dentro dos SLOs aprovados;
- rollback e resposta a incidente ensaiados;
- privacy/security review sem P0/P1 abertos;
- aprovacao formal do sponsor, Tech Lead, QA e Security/Privacy Owner.

## KPIs e Sinais de Controle

### Seguranca e Privacidade

- 100% dos webhooks com conta, assinatura, timestamp e event ID validados;
- 0 operacoes administrativas com ator proveniente do body;
- 0 fallback de identidade por nome;
- 100% das chaves de fila com politica de expiracao ou lifecycle documentado;
- 0 PII bruta em amostra automatizada de logs;
- 100% das solicitacoes de eliminacao comprovadas por auditoria;
- 100% das tools mutaveis com schema e autorizacao server-side.

### Confiabilidade

- webhook acknowledge p95 dentro do SLO aprovado;
- idade p95 da fila dentro do SLO aprovado;
- taxa de DLQ abaixo do limite operacional;
- 0 perda ou duplicacao em testes de restart e concorrencia;
- 100% dos shutdowns de teste concluidos sem job abandonado;
- restore executado dentro do RTO e RPO aprovados.

### Qualidade

- 100% dos arquivos TypeScript elegiveis considerados pela cobertura;
- 0 testes codificando comportamento inseguro conhecido;
- 0 divergencia entre Node local, CI e Docker;
- 0 artefato `dist` divergente rastreado;
- documentacao de status atualizada pelo mesmo gate de release.

## Estrategia de Entrega por PR

Cada PR deve tratar um risco coeso e manter compatibilidade durante migracoes.

Sequencia recomendada:

1. `chore: establish reproducible security baseline`
2. `feat: replace header-defined identity with signed claims`
3. `feat: enforce chatwoot account and contact identity boundaries`
4. `feat: add timestamped webhook verification and replay protection`
5. `feat: enforce data retention minimization and deletion workflows`
6. `fix: remove logger resource leak and sensitive logging`
7. `feat: harden stores migrations and transport security`
8. `feat: make webhook worker lease-safe and shutdown gracefully`
9. `feat: validate and authorize all agent tool executions`
10. `test: add clinical adversarial and real infrastructure coverage`
11. `ci: enforce release security quality and migration gates`
12. `test: prove real chatwoot whatsapp staging flow`
13. `docs: consolidate operational source of truth`

## Riscos do Programa

| Risco | Impacto | Mitigacao |
|---|---|---|
| Mudanca de identidade quebra consumidores internos | Indisponibilidade administrativa | Compatibilidade temporaria com feature flag e migracao de clientes |
| Inclusao de tenant altera muitas chaves e constraints | Mistura ou indisponibilidade de dados | Migracao expand/backfill/contract com verificacao de contagem |
| Expurgo remove dados ainda necessarios | Perda operacional ou legal | Politica aprovada, dry-run, backup e janela de recuperacao |
| Mudanca do contrato de webhook rejeita eventos legitimos | Mensagens nao processadas | Teste com staging real e rollout monitorado |
| Leasing de fila cria duplicacao ou jobs presos | Respostas repetidas ou perdidas | Testes de concorrencia, idempotencia duravel e rollout de uma replica |
| Minimizacao reduz qualidade da IA | Mais fallbacks e handoffs | Avaliar qualidade offline e manter fatos necessarios pseudonimizados |
| Escopo cresce com refatoracoes amplas | Atraso dos bloqueadores | Limitar refatoracoes a riscos do backlog e adiar melhorias cosmeticas |

## Criterio de Go/No-Go

### Go

Somente quando G0-G5 estiverem aprovados, nao houver P0/P1 aberto sem aceite formal, o E2E externo estiver comprovado e o plano de incidente estiver operacional.

### No-Go

Qualquer uma das condicoes abaixo bloqueia producao:

- identidade administrativa ainda autodeclarada;
- webhook sem timestamp, replay protection ou vinculo de conta;
- contato ainda reconciliado por nome;
- PII sem retencao e eliminacao implementadas;
- secrets/stores expostos com credenciais de desenvolvimento;
- worker sujeito a roubo de jobs entre replicas;
- gates de CI vermelhos;
- ausencia de E2E externo ou rollback comprovado.

## Referencias

- `docs/63_current_project_code_audit.md`
- `docs/65_remediation_roadmap.md`
- `docs/66_remediation_backlog.md`
- `docs/49_production_runbook.md`
- `docs/61_final_whatsapp_e2e_validation.md`

*Plano executivo registrado em 2026-08-02.*
