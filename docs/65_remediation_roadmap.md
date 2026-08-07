# 65 - Roadmap de Remediacao

## Objetivo

Organizar no tempo a execucao do plano definido em `docs/64_executive_remediation_plan.md`, usando os IDs e criterios de aceite de `docs/66_remediation_backlog.md`.

Este roadmap e uma referencia de sequenciamento. O status real de cada item deve ser atualizado somente no backlog 66.

## Premissas de Capacidade

O calendario de 12 semanas considera, como referencia:

- 2 pessoas de backend com dedicacao principal;
- 1 pessoa de QA com dedicacao parcial e crescente nas fases finais;
- 1 pessoa de plataforma/DevOps parcial;
- revisao semanal de seguranca e privacidade;
- disponibilidade da operacao hospitalar para validar fluxos;
- ambiente de staging com Chatwoot e WhatsApp de teste ate a semana 9.

Com uma unica pessoa de engenharia, o mesmo escopo deve ser mantido, mas o prazo esperado aumenta. Nao se recomenda remover gates para compensar falta de capacidade.

## Visao Geral

| Fase | Janela de referencia | Objetivo | Gate de saida |
|---|---|---|---|
| F0 | Dias 1-3 | Contencao e baseline reproduzivel | G0 |
| F1 | Semanas 1-2 | Identidade, conta e webhook confiaveis | G1 |
| F2 | Semanas 3-4 | Privacidade, isolamento e stores seguros | G2 parcial |
| F3 | Semanas 5-6 | Runtime, filas e observabilidade resilientes | G3 parcial |
| F4 | Semanas 7-8 | IA, tools e seguranca clinica | G2/G3 completos |
| F5 | Semanas 9-10 | Qualidade, CI/CD, supply chain e recuperacao | G4 |
| F6 | Semanas 11-12 | E2E externo, operacao e liberacao | G5 |

## Dependencias Principais

```text
Baseline reproduzivel (F0)
        |
        +--> Identidade/RBAC --------+
        |                            |
        +--> Conta/contato -----------+--> Webhook confiavel (F1)
        |                                             |
        +---------------------------------------------+
                                                      v
                                      Modelo tenant + politica de dados (F2)
                                                      |
                           +--------------------------+--------------------+
                           |                                               |
                           v                                               v
                 Stores e migracoes seguros                    Minimizacao e retencao
                           |                                               |
                           +--------------------------+--------------------+
                                                      v
                                       Worker/runtime resiliente (F3)
                                                      |
                                                      v
                                     Tools e seguranca clinica (F4)
                                                      |
                                                      v
                                      CI, testes e recovery (F5)
                                                      |
                                                      v
                                       E2E externo e go-live (F6)
```

## F0 - Contencao e Baseline Reproduzivel

### Janela

Dias 1 a 3.

### Objetivo

Impedir aumento da superficie de risco e criar uma base de trabalho reproduzivel.

### Entregas

- congelamento temporario de features;
- servico restrito a rede controlada e uma replica;
- working tree consolidado em branch revisavel;
- arquivos centrais rastreados pelo Git;
- `dist` e backups tratados sem apagar evidencia necessaria;
- branch default e CI identificados;
- owners nomeados;
- decisoes D1-D4 abertas e com prazo;
- matriz inicial de riscos e dados.

### Backlog Relacionado

```text
GOV-001 GOV-002 GOV-003 GOV-004
REP-001 REP-002 REP-003
CICD-001 CICD-003
```

### Criterios de Saida - Gate G0

- checkout limpo consegue instalar e buildar;
- codigo central da auditoria esta rastreado;
- CI executa na branch default;
- Node esta alinhado entre local, Docker e CI;
- cada frente possui owner;
- decisoes sobre tenant, identidade, dados/IA e topologia estao registradas.

### Risco de Nao Executar

Correcoes podem ser aplicadas sobre uma arvore nao reproduzivel, dificultando revisao, rollback e auditoria.

## F1 - Fronteiras de Confianca

### Janela

Semanas 1 e 2.

### Objetivo

Garantir identidade administrativa confiavel e aceitar somente eventos autenticos da conta correta.

### Trilha A - Identidade e Auditoria

- escolher e implementar identidade assinada;
- remover role, user ID e e-mail autodeclarados;
- derivar ator de auditoria somente da identidade verificada;
- impedir que falha de auditoria seja silenciosa em operacoes criticas;
- revisar todas as rotas e permissoes administrativas.

IDs:

```text
IAM-001 IAM-002 IAM-003 IAM-004
OBS-004
```

### Trilha B - Conta e Contato

- validar `account_id` e inbox;
- remover fallback de contato por nome;
- tornar account/contact identity obrigatoria no DTO interno;
- preparar a migracao tenant-aware aprovada em D1.

IDs:

```text
TEN-001 TEN-002 TEN-003
```

### Trilha C - Webhook

- confirmar o contrato real do Chatwoot;
- exigir assinatura e timestamp;
- implementar nonce/event ID e idempotencia duravel;
- restringir schema e tamanho de payload;
- corrigir rate limiting e `trust proxy`;
- criar testes negativos de conta, assinatura, timestamp e replay.

IDs:

```text
WHK-001 WHK-002 WHK-003 WHK-004 WHK-005 WHK-006
TST-001
```

### Criterios de Saida - Gate G1

- nenhum consumidor consegue escolher o proprio papel;
- nenhum body consegue forjar ator de auditoria;
- eventos de conta/inbox incorretas sao rejeitados;
- contato nao e localizado por nome;
- segredo ausente falha fechado;
- timestamp expirado e event ID repetido sao rejeitados;
- testes atuais que aceitavam comportamento inseguro foram substituidos.

### Rollout

1. adicionar modo novo sob feature flag;
2. migrar consumidores administrativos;
3. validar webhook em staging;
4. ativar fail-closed;
5. remover modo legado.

## F2 - Privacidade, Isolamento e Stores Seguros

### Janela

Semanas 3 e 4.

### Objetivo

Controlar segregacao, coleta, retencao, eliminacao e acesso aos dados.

### Trilha A - Governanca de Dados

- inventariar campos, finalidade, origem, destino e retencao;
- aprovar politica de dados e IA;
- definir processo de direitos do titular;
- documentar operadores e transferencia internacional;
- definir classificacao e owner por dataset.

IDs:

```text
PRV-001 PRV-002 PRV-005 PRV-006
DOC-003 DOC-004
```

### Trilha B - Tenant e Ciclo de Vida

- implementar `tenant_id/account_id` conforme D1;
- executar migracao expand/backfill/validate/contract;
- incluir tenant em Redis, indices e unicidades;
- minimizar jobs e remover campos `passthrough` desnecessarios;
- implementar TTL/expurgo para fila e DLQ;
- implementar eliminacao/anonimizacao auditavel.

IDs:

```text
TEN-004
PRV-003 PRV-004
DAT-006 DAT-007
```

### Trilha C - Stores e Transporte

- criar roles de aplicacao com privilegio minimo;
- retirar credenciais conhecidas do Compose de producao;
- configurar secrets e TLS;
- proteger Redis com ACL e Qdrant com credencial;
- definir criptografia ou tokenizacao seletiva;
- criar ledger/checksum de migracoes;
- provar backup e restore.

IDs:

```text
DAT-001 DAT-002 DAT-003 DAT-004 DAT-005
SUP-003
```

### Criterios de Saida - Gate G2 Parcial

- todos os dados pessoais possuem finalidade e retencao;
- DLQ nao retem PII indefinidamente;
- tenant/account esta presente em identidades e chaves;
- Postgres nao usa superusuario da aplicacao;
- Redis e Qdrant exigem credenciais fora de loopback;
- migracoes possuem estado e checksum;
- restore foi executado em ambiente isolado.

## F3 - Runtime e Observabilidade Resilientes

### Janela

Semanas 5 e 6.

### Objetivo

Eliminar vazamentos, duplicacoes e falsos sinais operacionais.

### Trilha A - Processo e Filas

- corrigir `logger.child()`;
- preservar e fechar o HTTP server;
- fechar pool PostgreSQL, worker e Redis em ordem;
- implementar leasing/visibility timeout por worker;
- tornar retry e recovery seguros entre replicas;
- manter idempotencia depois do TTL operacional;
- preservar correlation ID na fila.

IDs:

```text
REL-001 REL-002 REL-003 REL-004 REL-007
```

### Trilha B - Health e Configuracao

- separar liveness local de readiness;
- cachear checks externos e restringir readiness;
- alinhar timeouts de Docker/orquestrador;
- validar numericos, URLs, TLS e secrets no startup;
- revisar operacao inicial com uma e depois varias replicas.

IDs:

```text
REL-005 REL-006
DAT-007
```

### Trilha C - Logs, Metricas e Auditoria

- implementar redacao recursiva por allowlist;
- remover queries e conteudo clinico dos logs;
- usar logging de producao sem `pino-pretty` colorido;
- exportar contadores, gauges e histogramas;
- criar alertas de fila, DLQ, erro, handoff e dependencia;
- tornar auditoria critica duravel via transacao ou outbox.

IDs:

```text
OBS-001 OBS-002 OBS-003 OBS-004
```

### Criterios de Saida - Gate G3 Parcial

- teste de logger nao aumenta listeners;
- restart durante job nao perde nem duplica efeito;
- shutdown fecha todos os recursos;
- liveness nao consulta SaaS;
- readiness nao e endpoint publico de amplificacao;
- dashboards mostram histogramas e estado de todas as replicas;
- auditoria critica nao e descartada silenciosamente.

## F4 - IA, Tools e Seguranca Clinica

### Janela

Semanas 7 e 8.

### Objetivo

Garantir que o modelo nao possa contornar validacao, autorizacao ou limites clinicos.

### Entregas

- schema Zod estrito por tool;
- clamp e validacao server-side de UUIDs, datas, strings e enums;
- autorizacao e ownership por acao;
- confirmacao deterministica para reserva, cancelamento, publicacao e notificacao;
- suite de prompt injection, parafrases e cenarios clinicos;
- confianca baseada em evidencias, nao constante;
- fallback/handoff para baixa confianca e input bloqueado;
- minimizacao estruturada antes de OpenAI/OpenRouter;
- avaliacao da qualidade antes/depois da minimizacao;
- decisao sobre modulos de IA/Qdrant/WhatsApp nao conectados.

IDs:

```text
AI-001 AI-002 AI-003 AI-004 AI-005 AI-006
PRV-005
REP-004 REP-005
TST-002
```

### Criterios de Saida - Gates G2 e G3 Completos

- nenhuma tool mutavel confia apenas no JSON Schema do modelo;
- prompt injection nao consegue alterar ownership ou tenant;
- diagnostico, prescricao, prognostico e emergencia seguem politica aprovada;
- baixa confianca nao gera resposta fabricada;
- input bloqueado recebe resposta segura ou handoff;
- contexto externo e minimizado e testado;
- modulos legados possuem destino registrado.

## F5 - Qualidade, CI/CD e Recuperacao

### Janela

Semanas 9 e 10.

### Objetivo

Transformar todos os controles anteriores em evidencias continuas e reproduziveis.

### Entregas

- `coverage.include` cobrindo todos os modulos elegiveis;
- testes de `app.ts`, `server.ts`, auth, webhook, tenant e shutdown;
- testes com Postgres, Redis e Qdrant reais;
- testes de concorrencia, restart, migracao e restore;
- typecheck incluindo testes;
- CI na branch default com gates obrigatorios;
- contrato Node alinhado;
- dependencia vulneravel corrigida;
- imagens por digest, SBOM e scanning;
- artefato `dist` removido do Git ou validado automaticamente;
- arquivos grandes divididos somente onde reduzir risco de mudanca.

IDs:

```text
TST-003 TST-004 TST-005 TST-006 TST-007
CICD-001 CICD-002 CICD-003 CICD-004 CICD-005
SUP-001 SUP-002 SUP-003
REP-001 REP-002 REP-003 REP-004
```

### Criterios de Saida - Gate G4

```text
lint: pass
typecheck de src e tests: pass
testes unitarios: pass
testes de integracao real: pass
coverage lines: >= 80%
coverage branches: >= 70%
build limpo: pass
migracao e rollback: pass
restore: pass
npm audit producao: sem high/critical
SBOM e scan de imagem: pass
```

## F6 - Staging, E2E e Liberacao

### Janela

Semanas 11 e 12.

### Objetivo

Comprovar o comportamento real e entregar capacidade operacional ao hospital.

### Cenarios Obrigatorios

1. mensagem normal e resposta baseada em conhecimento;
2. horario, preco e informacao institucional;
3. agendamento completo com confirmacao real;
4. cancelamento e reagendamento com ownership;
5. emergencia e handoff humano;
6. pergunta clinica fora de escopo;
7. prompt injection e tentativa de tool indevida;
8. webhook invalido, expirado, repetido e de outra conta;
9. dois contatos com o mesmo nome;
10. indisponibilidade de OpenAI, Chatwoot, Redis, Postgres e Qdrant;
11. restart durante processamento;
12. eliminacao de dados e comprovacao de auditoria;
13. rollback de aplicacao e migracao;
14. restore de backup;
15. carga e crescimento de fila dentro dos SLOs.

### Entregas

- evidencias E2E anexadas;
- dashboard e alertas acompanhados durante o teste;
- runbooks de deploy, rollback, incidente, privacidade e restore atualizados;
- README e indice consolidados;
- reauditoria com nova nota;
- risk acceptance assinado para qualquer risco residual;
- reuniao formal de go/no-go.

IDs:

```text
TST-006 TST-007
DOC-001 DOC-002 DOC-003 DOC-004
GOV-004
```

### Criterios de Saida - Gate G5

- todos os cenarios obrigatorios aprovados;
- zero P0/P1 aberto sem aceite formal;
- SLOs, RPO e RTO comprovados;
- equipe hospitalar treinada para handoff e incidente;
- aprovacao do sponsor, Tech Lead, QA e Security/Privacy Owner.

## Marcos Executivos

| Marco | Resultado de negocio | Previsao de referencia |
|---|---|---|
| M0 - Baseline | Trabalho reproduzivel e governado | Dia 3 |
| M1 - Entrada confiavel | So identidades e eventos validos entram | Fim da semana 2 |
| M2 - Dados governados | PII segregada, minimizada e com lifecycle | Fim da semana 4 |
| M3 - Runtime resiliente | Processo recupera falhas sem perda/duplicacao | Fim da semana 6 |
| M4 - IA controlada | Modelo nao contorna regras clinicas e tools | Fim da semana 8 |
| M5 - Release candidate | Gates automaticos e recovery aprovados | Fim da semana 10 |
| M6 - Go-live decision | Fluxo externo e operacao comprovados | Fim da semana 12 |

## Caminho Critico

O caminho critico e:

```text
D1-D4
-> baseline reproduzivel
-> identidade + account binding
-> webhook real e replay protection
-> tenant/data lifecycle
-> stores/migracoes
-> worker/idempotencia
-> tools/guardrails
-> integracao real
-> E2E e go/no-go
```

Os seguintes trabalhos podem ocorrer em paralelo, desde que tenham owners distintos:

- consolidacao documental;
- correcao de dependencias e imagens;
- instrumentacao de metricas;
- criacao de datasets de avaliacao clinica;
- preparacao de staging e runbooks.

## Gestao de Mudanca e Rollback

### Banco de Dados

Usar estrategia:

```text
expand -> backfill -> validar -> ativar leitura nova -> ativar escrita nova -> contract
```

Nunca remover coluna, indice ou chave antiga no mesmo deploy que introduz a nova identidade.

### Webhook e Auth

- iniciar em modo de observacao;
- registrar eventos que seriam rejeitados sem processar PII adicional;
- validar consumidores;
- ativar enforcement em staging;
- promover com rollback por feature flag de curta duracao;
- remover o caminho legado depois da janela aprovada.

### Filas

- iniciar com uma replica;
- testar leasing sob falhas;
- habilitar segunda replica em staging;
- comparar duplicacao, queue age e DLQ;
- promover somente apos teste de restart e concorrencia.

## Controle de Escopo

Entram no programa:

- todos os itens registrados no backlog 66;
- ajustes diretamente necessarios para seus criterios de aceite;
- testes, migracoes, observabilidade e documentacao correspondentes.

Nao entram sem aprovacao executiva:

- novos canais;
- novas funcoes de negocio;
- troca ampla de framework;
- reescrita total do runtime;
- adocao de infraestrutura adicional sem relacao com um risco identificado.

## Atualizacao do Roadmap

- atualizar este documento apenas quando mudar sequenciamento, capacidade ou gates;
- atualizar status somente em `docs/66_remediation_backlog.md`;
- registrar desvios de prazo com causa, impacto e decisao;
- nao marcar fase como concluida enquanto seu gate nao estiver aprovado.

## Referencias

- `docs/63_current_project_code_audit.md`
- `docs/64_executive_remediation_plan.md`
- `docs/66_remediation_backlog.md`

*Roadmap registrado em 2026-08-02.*
