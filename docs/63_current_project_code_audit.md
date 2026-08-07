# 63 - Auditoria Atual do Projeto e do Codigo

## Objetivo

Registrar a auditoria tecnica do projeto conectado ao Chatwoot para atendimento de clientes do hospital, comparando a documentacao existente com o codigo implementado no working tree atual.

Esta auditoria cobre:

- arquitetura e aderencia funcional;
- integracao Chatwoot e WhatsApp;
- IA, RAG, ferramentas e guardrails;
- autenticacao, autorizacao e webhooks;
- privacidade, LGPD e ciclo de vida dos dados;
- persistencia, filas e confiabilidade;
- testes, cobertura, CI/CD e dependencias;
- observabilidade, documentacao e higiene do repositorio.

## Resumo Executivo

| Indicador | Nota |
|---|---:|
| Qualidade tecnica media | **51/100** |
| Prontidao para producao hospitalar | **48/100** |

## Veredito

O projeto possui uma boa base para piloto supervisionado, mas nao esta pronto para operacao autonoma em producao com dados reais de pacientes e tutores.

Os principais bloqueadores estao em:

1. autenticacao e autorizacao;
2. validacao da origem e protecao contra replay de webhooks;
3. isolamento de contas e identificacao de contatos;
4. retencao, eliminacao e minimizacao de dados pessoais;
5. operacao do worker, health checks e shutdown;
6. CI/CD e gates de release atualmente vermelhos.

O sistema esta mais avancado do que o README sugere. Ja existem worker assincrono, persistencia de conversas, agenda, RAG, tools, handoff, auditoria e guardrails. A principal lacuna nao e funcionalidade, mas controles de confianca, privacidade e operacao proporcionais a um ambiente hospitalar.

## Escopo e Condicao do Repositorio

Esta auditoria representa o working tree existente em 2026-08-02, sobre o commit:

```text
530082d8332769fa5c547eba94a87a995c43c2af
```

No momento da auditoria havia dezenas de alteracoes locais pre-existentes e arquivos centrais ainda nao rastreados pelo Git, incluindo worker de webhook, repositorio de conversas, migracoes e testes.

Consequentemente, esta fotografia ainda nao representa uma release integralmente reproduzivel apenas a partir do commit atual.

Nenhum arquivo de codigo foi alterado durante a auditoria.

## Arquitetura Encontrada

```text
Chatwoot / WhatsApp
        |
        v
Webhook -> validacao/assinatura -> Redis -> worker
                                      |
                                      v
                       contexto + intencao + RAG
                                      |
                             OpenAI/OpenRouter
                                      |
                    ferramentas / agenda / handoff
                                      |
                                      v
                                  Chatwoot

PostgreSQL: contatos, conversas, agenda, conhecimento e auditoria
Qdrant: busca vetorial
Telegram: ingestao administrativa de conhecimento
```

## Notas por Area

| Area analisada | Nota | Avaliacao |
|---|---:|---|
| Aderencia ao dominio e funcionalidades | **78** | Agenda, conhecimento, handoff e atendimento estao bem representados. |
| Arquitetura e modularidade | **69** | Boa separacao conceitual, mas ha arquivos muito grandes e modulos duplicados ou nao conectados. |
| Integracao Chatwoot/WhatsApp | **60** | Fluxo completo implementado, porem falta E2E real e validacao confiavel da conta e origem. |
| IA, RAG e ferramentas | **70** | Pipeline consistente, mas confianca e artificial e argumentos de tools nao sao revalidados integralmente no servidor. |
| Seguranca clinica e handoff | **64** | Existem guardrails e escalonamento, mas sao principalmente regex e nao cobrem bem parafrases e ataques adversariais. |
| Autenticacao da API | **12** | Bloqueador critico: papel e identidade sao definidos por headers enviados pelo cliente. |
| Autenticidade e replay de webhooks | **38** | Assinatura pode falhar aberta e timestamp e opcional. |
| Privacidade e LGPD | **18** | Nao ha ciclo de retencao, eliminacao, minimizacao suficiente nem isolamento de dados. |
| Persistencia e integridade | **55** | SQL e transacoes razoaveis, mas faltam isolamento, controle de migracoes e governanca de PII. |
| Confiabilidade e escalabilidade | **48** | Worker, shutdown, health checks e operacao multi-replica possuem riscos concretos. |
| Observabilidade | **42** | Logs estruturados existem, mas ha vazamento de recursos, redacao incompleta e metricas apenas em memoria. |
| Testes e cobertura | **56** | 450 testes passam, mas cobertura esta abaixo do gate e nao ha testes com infraestrutura real. |
| CI/CD e release | **40** | Workflow nao acompanha a branch atual e os gates de cobertura e audit falham. |
| Documentacao | **60** | Runbooks bons, mas indices, roadmap, status e README divergem. |
| Dependencias e supply chain | **68** | Lockfile e imagem multi-stage sao positivos; existe vulnerabilidade de producao e imagens sem digest. |
| Higiene do repositorio | **40** | `dist` versionado e divergente, backups presentes e codigo central ainda nao rastreado. |

## Achados Criticos

### 1. Identidade e Papel Podem Ser Autodeclarados

Depois de validar um token compartilhado, a API aceita os headers:

```text
x-user-role
x-user-id
x-user-email
```

O cliente pode, portanto, definir seu proprio papel e identidade. Na ausencia de `x-user-role`, o papel padrao e `admin`.

Impactos:

- qualquer portador do token pode tornar-se administrador;
- publicacao de conhecimento e alteracoes de agenda podem ser feitas sem identidade confiavel;
- trilhas de auditoria podem atribuir operacoes a terceiros;
- o RBAC atual nao representa uma fronteira real de seguranca.

Evidencias:

- `src/middleware/auth.ts:39-65`;
- `tests/unit/auth-middleware.test.ts:27-50`;
- `src/modules/knowledge/adminRoutes.ts:118-151`.

Recomendacao P0:

- adotar OIDC, JWT assinado ou mTLS;
- obter roles de claims verificadas ou do servidor;
- usar credenciais distintas por cliente ou servico;
- nunca aceitar identidade de auditoria a partir do body ou de headers nao assinados.

### 2. Nao Existe Isolamento ou Vinculo Forte com a Conta Chatwoot

O `account_id` recebido no webhook e copiado para metadata, mas nao e comparado com a conta configurada. As tabelas e chaves Redis nao carregam `tenant_id` ou `account_id` como parte de sua identidade.

Tambem existe fallback de identificacao de contato por nome quando o `chatwoot_id` nao e encontrado.

Impactos:

- eventos de outra conta podem entrar no pipeline;
- contatos ou conversas com IDs iguais podem colidir;
- pessoas com nomes iguais podem receber contexto, pets ou memorias de outro tutor;
- uma futura operacao multi-conta seria insegura por construcao.

Evidencias:

- `src/modules/chatwoot/normalizer.ts:168-188`;
- `src/modules/conversations/contextLoader.ts:303-329`;
- `database/schema.sql:13-100`;
- `src/shared/redis.ts:240-295`.

Recomendacao P0:

- validar `account_id` e inbox antes de enfileirar;
- remover o fallback de contato por nome;
- exigir chave composta por tenant, conta e ID Chatwoot;
- incluir tenant em tabelas, indices, filas, caches e credenciais.

### 3. Webhook Pode Ser Repetido

O timestamp de assinatura e opcional. Uma assinatura somente do corpo pode ser aceita indefinidamente. Se o segredo estiver vazio, o middleware permite que a requisicao prossiga.

A validacao de startup reduz parte do risco somente quando o processo inicia pelo caminho esperado e `NODE_ENV` e exatamente `production`.

O smoke test gera sua propria assinatura. Ele comprova a implementacao interna, mas nao valida o contrato real da versao, do canal e dos headers usados pelo deployment Chatwoot do hospital.

Evidencias:

- `src/middleware/chatwoot-signature.ts:67-103`;
- `tests/unit/chatwoot-signature.test.ts:29-53`;
- `src/modules/readiness/stagingSmoke.ts:141-159`.

Recomendacao P0:

- exigir timestamp assinado e uma janela curta de validade;
- armazenar nonce ou event ID para impedir replay duravel;
- falhar fechado em todos os ambientes conectados;
- rejeitar formatos legados sem timestamp;
- validar o contrato contra a instalacao Chatwoot real.

### 4. PII e Conteudo Clinico Sem Ciclo de Vida Implementado

O Redis recebe o payload bruto do Chatwoot. As filas `pending`, `processing` e `failed` nao possuem uma politica completa de TTL e expurgo; a DLQ pode reter dados pessoais indefinidamente.

PostgreSQL armazena contatos, pets, conversas, memorias e conteudo clinico sem um job demonstrado de retencao ou eliminacao.

Historico, nomes, pets, memorias e informacoes clinicas tambem podem ser enviados para OpenAI e OpenRouter. O mascaramento cobre alguns formatos de CPF, telefone e e-mail, mas nao realiza minimizacao estruturada de nomes, enderecos ou fatos clinicos.

Evidencias:

- `src/modules/webhook/worker.ts:44-64`;
- `src/shared/redis.ts:108-157`;
- `src/shared/redis.ts:289-315`;
- `src/modules/runtime/agentRuntime.ts:623-633`;
- `src/modules/openai/client.ts:141-188`;
- `src/modules/ai/openrouter.ts:195-216`.

Recomendacao P0:

- definir prazos tecnicos de retencao por tipo de dado;
- implementar expurgo auditavel no Redis e PostgreSQL;
- fornecer eliminacao e anonimizacao por titular;
- minimizar e pseudonimizar o contexto antes de provedores externos;
- documentar finalidade, base legal, operadores, transferencia e retencao.

### 5. Vazamento de Recursos no Logger

Cada chamada de `logger.child()` cria uma nova instancia e um novo transporte `pino-pretty`, depois substitui o logger interno.

Uma reproducao elevou os listeners de saida de 1 para 13 depois de 12 chamadas e gerou `MaxListenersExceededWarning`.

Como child loggers sao criados durante o processamento de webhooks, o problema pode degradar processos de longa duracao.

Evidencias:

- `src/modules/logging/index.ts:16-66`;
- `src/modules/runtime/agentRuntime.ts:327`.

Recomendacao P0:

- criar o transporte uma unica vez;
- implementar `child()` usando o child logger nativo do Pino;
- adicionar teste de regressao para listeners e transports.

### 6. Pipeline de Release Nao Esta Verde

O workflow observa as branches `main` e `develop`, enquanto a branch atual e `master`. Commits na branch principal atual nao disparam o CI esperado.

Tambem foram encontrados:

- cobertura de 62,69% de linhas, abaixo do minimo de 65%;
- uma vulnerabilidade baixa de producao em dependencia transitiva;
- modulos nao carregados fora do relatorio de cobertura;
- ausencia de testes reais com PostgreSQL, Redis, Chatwoot ou Qdrant no CI.

Evidencias:

- `.github/workflows/ci.yml:3`;
- `vitest.config.ts:5-20`;
- `package-lock.json`.

Recomendacao P0/P1:

- alinhar o workflow com a branch default;
- tornar cobertura e `npm audit --omit=dev` gates verdes;
- configurar `coverage.include` para todos os modulos elegiveis;
- executar testes com PostgreSQL e Redis reais no CI;
- adicionar smoke controlado para Chatwoot em staging.

## Achados Altos de Operacao e Seguranca

### Shutdown Incompleto

O servidor HTTP iniciado por `app.listen()` nao tem seu handle preservado. O shutdown encerra worker e Redis, mas nao fecha HTTP nem o pool PostgreSQL antes de `process.exit()`.

Evidencias:

- `src/server.ts:38-83`;
- `src/shared/db/index.ts:84`.

### Worker Inseguro em Multiplas Replicas

Na inicializacao, cada worker recupera globalmente itens da fila `processing` para `pending`. Uma replica pode recuperar trabalho ainda ativo em outra replica.

O requeue tambem pode disponibilizar o job antes do atraso local, permitindo retry antecipado por outro processo.

Evidencias:

- `src/modules/webhook/worker.ts:106-167`;
- `src/shared/redis.ts:144`.

### Health Check Caro e Exposto

`/health` e `/ready` sao publicos, nao possuem rate limit e consultam dependencias externas. O Docker concede apenas tres segundos, enquanto uma unica chamada Chatwoot pode esperar ate dez segundos.

Uma indisponibilidade de provedor pode marcar o container como unhealthy e provocar reinicios desnecessarios.

Evidencias:

- `src/app.ts:51-62`;
- `src/app.ts:287-377`;
- `src/modules/chatwoot/client.ts:26`;
- `Dockerfile:46`.

### Rate Limit Contornavel

O limitador do webhook usa `x-chatwoot-account-id`, controlado pelo cliente, como parte da chave. Um atacante pode variar o header para contornar o limite.

O parsing JSON tambem acontece antes do limitador.

Evidencias:

- `src/middleware/rate-limit.ts:26-34`;
- `src/app.ts:23-49`.

### Logs Podem Conter Dados Sensíveis

A redacao nao e recursiva e nao protege integralmente objetos aninhados, bindings de child logger ou `Error.stack`. Consultas RAG, trechos clinicos e inputs de repositorios podem aparecer nos logs.

Evidencias:

- `src/modules/logging/index.ts:30-63`;
- `src/shared/data-masking.ts:107-131`;
- `src/modules/knowledge/retrieval.ts:202-277`;
- `src/modules/contacts/repository.ts:114-204`.

### Infraestrutura com Credenciais Fracas

O Compose usa o superusuario `postgres` com senha conhecida e Redis sem AUTH ou TLS. O agente e publicado em HTTP na porta 3023.

Isso pode ser aceitavel apenas em desenvolvimento isolado. Nao e uma configuracao segura de producao.

Evidencias:

- `docker-compose.yml:3-28`;
- `docker-compose.yml:47-87`;
- `src/shared/db/index.ts:9-16`;
- `src/shared/redis.ts:19-35`.

## IA, Tools e Seguranca Clinica

### Pontos Positivos

- existem guardrails antes e depois da IA;
- ha classificacao de emergencia e handoff;
- agenda possui transacoes e verificacoes de propriedade em diversas operacoes;
- o runtime consulta conhecimento, precos e horarios de forma deterministica;
- ha circuit breaker, retry, deduplicacao e DLQ.

### Lacunas

- guardrails sao principalmente expressoes regulares e podem falhar com parafrases;
- respostas OpenAI recebem confianca fixa de 0,8, independentemente da evidencia;
- JSON Schema enviado ao modelo funciona como orientacao, mas os argumentos das tools nao sao integralmente revalidados no executor;
- tools mutaveis de reserva, handoff e notificacao podem ser acionadas a partir de conteudo adversarial;
- input bloqueado por guardrail pode ser descartado silenciosamente, sem resposta ou handoff;
- nao existe evidencia de avaliacao adversarial real com o modelo em producao.

Evidencias:

- `src/modules/security/guardrails.ts:142-240`;
- `src/modules/openai/client.ts:286-300`;
- `src/modules/agent-tools/registry.ts:375-399`;
- `src/modules/runtime/agentRuntime.ts:429-448`.

## Persistencia e Integridade

### Pontos Positivos

- a maior parte das consultas usa parametros SQL;
- agenda utiliza transacoes;
- existem verificacoes de conversa e contato para confirmar, cancelar e reagendar;
- persistencia de conversas mascara alguns identificadores antes do PostgreSQL.

### Lacunas

- nao ha tenant ou account ID no schema principal;
- migracoes SQL sao executadas sem ledger ou checksum demonstrado;
- existem interpolacoes de `days` e `LIMIT` em alguns repositorios;
- nao ha RLS, role de aplicacao com privilegio minimo ou criptografia seletiva;
- soft delete e desativacao nao equivalem a eliminacao de dados pessoais;
- backups, restore e exercicios de recuperacao nao foram comprovados.

## Testes e Qualidade de Codigo

### Verificacoes Executadas

| Verificacao | Resultado |
|---|---|
| `npm run lint` | Passou |
| `npm run typecheck` | Passou |
| `npm test -- --reporter=dot` | **450/450 testes passaram** |
| `npm run test:coverage -- --reporter=dot` | Falhou no gate |
| Cobertura de statements | 62,72% |
| Cobertura de branches | 55,72% |
| Cobertura de funcoes | 69,14% |
| Cobertura de linhas | **62,69%** |
| Testes focados de seguranca | **71/71 passaram** |
| `npm audit --omit=dev` | Falhou: uma vulnerabilidade baixa |
| Build em copia temporaria | Passou |
| `docker compose --env-file .env.example config --quiet` | Passou |

Os testes focados de seguranca confirmam dois comportamentos inseguros atuais:

- papel administrativo definido por header;
- assinatura de webhook aceita sem timestamp.

### Lacunas de Cobertura

O relatorio de cobertura inclui apenas modulos carregados. Cerca de 54 de 75 arquivos TypeScript elegiveis apareceram no relatorio.

Entre as areas sem cobertura efetiva ou nao conectadas ao runtime principal estao:

- canais diretos de WhatsApp;
- partes de `intelligence`;
- memory tools;
- alguns repositorios;
- caminhos Telegram;
- `app.ts` e `server.ts`, excluidos explicitamente.

Os testes sao predominantemente unitarios e usam mocks. O CI nao inicia PostgreSQL, Redis ou Qdrant reais.

## Observabilidade

### Pontos Positivos

- logs estruturados;
- correlation ID;
- contadores, gauges e histogramas;
- health e readiness endpoints;
- eventos de auditoria.

### Lacunas

- histogramas sao armazenados, mas nao retornados pela coleta principal;
- metricas ficam somente em memoria e divergem entre replicas;
- metricas desaparecem em reinicios;
- `pino-pretty` colorido e usado mesmo em caminhos de producao;
- correlation ID e trocado na fronteira da fila;
- falhas ao persistir auditoria sao ignoradas e a operacao continua.

Evidencias:

- `src/modules/metrics.ts:21-52`;
- `src/modules/runtime/agentRuntime.ts:323-327`;
- `src/modules/audit/service.ts:43-70`.

## Documentacao Versus Implementacao

A documentacao cobre bem o dominio, runbooks e planos, mas nao funciona atualmente como fonte unica da verdade.

Principais divergencias:

1. `docs/00_readme.md` termina seu indice em documentos antigos;
2. `README.md` ainda descreve o projeto como fase inicial;
3. `docs/62_current_goal_status.md` registra 240 testes e 85,38% de linhas, enquanto a execucao atual encontrou 450 testes e 62,69%;
4. roadmap, planos e relatorios classificam as mesmas entregas como concluidas, parciais ou bloqueadas;
5. o blueprint multi-tenant esta documentado, mas nao implementado;
6. os smokes locais validam os validadores, nao uma integracao externa real;
7. a propria documentacao reconhece a ausencia de E2E real WhatsApp.

### Nota da Documentacao

| Item | Nota |
|---|---:|
| Cobertura tematica | 92 |
| Clareza de visao e escopo | 78 |
| Navegacao e indices | 42 |
| Fonte unica da verdade | 25 |
| Consistencia interna | 34 |
| Atualidade | 48 |
| Rastreabilidade e evidencias | 72 |
| Operacao e runbook | 90 |
| README e onboarding | 45 |
| **Nota consolidada** | **60** |

## Higiene e Classificacao dos Modulos

| Classificacao | Modulos ou ativos | Recomendacao |
|---|---|---|
| Core Asset | runtime, integracao Chatwoot, agenda, knowledge ativo, conversas, seguranca e persistencia | Preservar e evoluir com testes. |
| Extract & Merge | adaptadores Qdrant duplicados e camadas paralelas de IA | Consolidar contratos e remover duplicacao. |
| Rebuild | auth/RBAC, verificacao de webhook, ciclo de vida de PII, logger e health checks | Reimplementar as fronteiras de confianca. |
| Deprecate/Archive | `dist` rastreado, backups de Compose, Qdrant legado e modulos nao conectados | Arquivar ou remover apos confirmar ausencia de consumidores. |

Nao foram encontradas bibliotecas de terceiros copiadas diretamente para o repositorio. As dependencias externas sao administradas principalmente pelo npm.

## Pontos Positivos Consolidados

- TypeScript em modo estrito;
- lint e typecheck aprovados;
- 450 testes sem testes pulados;
- agenda transacional;
- deduplicacao, retry, DLQ e circuit breaker;
- handoff e classificacao de emergencia;
- Docker multi-stage e usuario nao-root;
- lockfile versionado;
- nenhum segredo real detectado na varredura limitada;
- runbook de producao detalhado em `docs/49_production_runbook.md`;
- reconhecimento explicito da ausencia de E2E real em `docs/61_final_whatsapp_e2e_validation.md`.

## Plano de Correcao Priorizado

### P0 - Antes de Dados Reais

1. substituir identidade e roles definidos por headers;
2. validar conta e inbox Chatwoot;
3. remover identificacao de contato por nome;
4. exigir timestamp assinado e impedir replay de webhook;
5. implementar retencao, expurgo e eliminacao de PII;
6. minimizar e pseudonimizar dados enviados a IA;
7. corrigir o vazamento de transports e listeners do logger;
8. alinhar CI com a branch default e deixar gates verdes.

### P1 - Antes de Escalar

1. tornar worker seguro em multiplas replicas;
2. implementar graceful shutdown completo;
3. separar liveness local de readiness de dependencias;
4. proteger Redis e PostgreSQL com credenciais, TLS e privilegio minimo;
5. adicionar validacao Zod estrita por tool;
6. executar testes de integracao com infraestrutura real;
7. implementar metricas externas e auditoria duravel;
8. consolidar migracoes com ledger e checksum.

### P2 - Sustentabilidade

1. dividir arquivos grandes, especialmente `agentRuntime.ts`;
2. consolidar adaptadores Qdrant e camadas de IA;
3. retirar `dist` e backups do controle de versao;
4. consolidar README, roadmap e status;
5. criar suites de seguranca clinica e prompt injection;
6. fixar imagens Docker por digest e gerar SBOM.

## Condicoes Minimas Para Reavaliacao de Producao

- autenticacao baseada em identidade verificavel;
- webhooks autenticados, vinculados a conta e protegidos contra replay;
- isolamento de dados e identificacao deterministica de contatos;
- politica implementada de retencao e eliminacao;
- dados enviados a IA minimizados e governados;
- cobertura e audit aprovados no CI da branch default;
- testes reais com PostgreSQL e Redis;
- E2E real Chatwoot e WhatsApp com evidencias;
- teste de carga e recuperacao do worker;
- revisao juridica e de privacidade para o contexto hospitalar.

## Limitacoes da Auditoria

Foram realizadas leitura estatica, comparacao documental, testes automatizados e validacoes locais.

Nao foram realizados:

- pentest dinamico;
- teste com uma conta Chatwoot real;
- mensagem real via WhatsApp e EvolutionAPI;
- teste de carga prolongado;
- restauracao real de backup;
- validacao juridica de LGPD;
- auditoria da infraestrutura externa onde o sistema sera hospedado.

## Conclusao

O projeto possui uma fundacao tecnica relevante e varias funcionalidades importantes ja implementadas. Entretanto, a combinacao de autenticacao autodeclarada, ausencia de isolamento, webhook repetivel, retencao indefinida de PII e gates de release falhando impede classificar o sistema como pronto para producao hospitalar.

O caminho recomendado e preservar o nucleo funcional, reconstruir as fronteiras de confianca e comprovar o fluxo real em staging antes de promover a solucao.

*Auditoria registrada em 2026-08-02.*
