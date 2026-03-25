# PHASES.md - Plano de Execução por Fases

## 1. Introdução

### 1.1 Objetivo do Plano por Fases

Este documento estabelece o guia oficial de implementação incremental do CVG Secretary Agent, organzando o projeto em fases executáveis que permitem construção segura, testes graduais e entrega de valor em cada etapa. O planejamento por fases reduz riscos, permite aprendizado iterativo e viabiliza ajustes de escopo baseados em feedback real de operação.

### 1.2 Por Que Implementação Incremental

A implementação incremental do agente secretaria oferece vantagens fundamentais que justificam a abordagem:

- **Riscos distribuídos**: Falhas em uma fase não comprometem o sistema completo, permitindo correção antes de avanços
- **Validação contínua**: Cada fase entregue pode ser testada e validada em produção real, gerando dados para decisões das fases subsequentes
- **Flexibilidade de prioridades**: Mudanças de mercado ou negócio podem influenciar a ordem de desenvolvimento sem重构 total
- **Feedback rápido**: Equipes aprendem com operação real e podem ajustar especificações antes de comprometer recursos em funcionalidades não validadas
- **Complexidade gerenciável**: Equipes menores podem focar em escopos menores, reduzindo coordenação e aumentando qualidade

---

## 2. Visão Geral das Fases

| Fase | Nome | Objetivo Principal | Dependência Principal |
|------|------|-------------------|----------------------|
| **Phase 0** | Specs e Source of Truth | Consolidação de documentos como fonte oficial | Nenhuma |
| **Phase 1** | Runtime Base e Integração Chatwoot/OpenAI | Agente funcional recebendo e respondendo mensagens | Phase 0 |
| **Phase 2** | Memória Persistente e Relacionamento | Armazenamento de dados de clientes e pets | Phase 1 |
| **Phase 3** | RAG e Conhecimento Institucional | Base de conhecimento consultável | Phase 1, Phase 2 |
| **Phase 4** | Secretaria Operacional e Handoff | Funcionalidades completas de atendimento | Phase 1, Phase 2, Phase 3 |
| **Phase 5** | Ingestão via Telegram e Autoalimentação Governada | Atualização de conhecimento por admins | Phase 3, Phase 4 |
| **Phase 6** | Segurança Avançada, Observabilidade e Maturidade Operacional | Produção enterprise-ready | Phase 1-5 |

---

## 3. Fase 0 — Specs e Source of Truth

### 3.1 Objetivo

Estabelecer os documentos de especificação como fonte única e oficial da verdade para o projeto, garantindo que todas as implementações futuras tenham referência confiável e consistente.

### 3.2 Dependências

Nenhuma — esta fase inicia o projeto.

### 3.3 Arquivos de Referência

| Arquivo | Descrição |
|---------|-----------|
| `specs/00_VISION.md` | Visão do produto, missão, escopo MVP e futuro |
| `specs/01_SYSTEM_ARCHITECTURE.md` | Arquitetura macro do sistema |
| `specs/02_AGENT_BEHAVIOR.md` | Persona, tom de voz, regras de interação |
| `specs/03_MEMORY_ARCHITECTURE.md` | Arquitetura de memória de curto e longo prazo |
| `specs/04_DATABASE_SCHEMA.md` | Schema do banco de dados Postgres |
| `specs/05_RAG_KNOWLEDGE_SYSTEM.md` | Sistema de conhecimento RAG |
| `specs/06_CHATWOOT_INTEGRATION.md` | Integração com Chatwoot |
| `specs/07_TELEGRAM_INGESTION.md` | Ingestão via Telegram |
| `specs/08_HANDOFF_SYSTEM.md` | Sistema de transferência para humano |
| `specs/09_AGENT_TOOLS.md` | Catálogo de ferramentas do agente |
| `specs/10_SECURITY_AND_GUARDRAILS.md` | Segurança e guardrails |
| `specs/11_AGENT_RUNTIME_FLOW.md` | Fluxo de execução do agente |
| `specs/12_DEPLOYMENT_ARCHITECTURE.md` | Arquitetura de deploy |
| `specs/13_LOGGING_AND_OBSERVABILITY.md` | Logging e observabilidade |
| `specs/14_ROADMAP.md` | Roadmap de evolução |

### 3.4 Componentes Envolvidos

- Documentação técnica (todos os specs)
- Repositório Git com versionamento

### 3.5 Implementações Previstas

- Revisão completa de todos os specs para consistência interna
- Criação de glossário de termos técnicos
- Definição de convenções de nomenclatura
- Mapeamento de dependências entre especificações
- Validação de consistência entre specs de diferentes áreas

### 3.6 Fora de Escopo

- Implementação de código
- Configuração de infraestrutura
- Integrações externas

### 3.7 Entregáveis

- [ ] specs/PHASES.md (este documento)
- [ ] Glossário técnico consolidado
- [ ] Matriz de dependências entre specs
- [ ] Documento de governança de mudanças

### 3.8 Critérios de Aceite

- [ ] Todos os 14 specs revisados e validados quanto à consistência
- [ ] Divergências identificadas e resolvidas
- [ ] Plano de fases documentado com clareza
- [ ] Regras de governança estabelecidas

### 3.9 Riscos Principais

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|----------|
| Especificações contraditórias | Média | Alto | Revisão cruzada por múltiplos specs |
| Especificações incompletas | Média | Médio | Checklist de validação por área |
| Falta de ownership dos specs | Baixa | Alto | Definir responsáveis por área |

### 3.10 Rollback Conceitual

Se inconsistencies graves forem detectadas durante a revisão, retornar aos specs específicos para correção antes de prosseguir. Documentar todas as correções feitas.

---

## 4. Fase 1 — Runtime Base e Integração Chatwoot/OpenAI

### 4.1 Objetivo

Criar a infraestrutura básica do agente que permite receber mensagens do Chatwoot, processar através do LLM OpenAI e retornar respostas ao cliente. Esta fase estabelece o core do sistema operacional.

### 4.2 Dependências

- Phase 0 completa

### 4.3 Arquivos de Referência

| Arquivo | Seção Relevante |
|---------|----------------|
| `specs/01_SYSTEM_ARCHITECTURE.md` | Seções 1-3: Visão macro, fluxo síncrono |
| `specs/06_CHATWOOT_INTEGRATION.md` | Todo o documento |
| `specs/11_AGENT_RUNTIME_FLOW.md` | Seções 1-2: Visão geral e diagrama |
| `specs/12_DEPLOYMENT_ARCHITECTURE.md` | Seções 1-4: Serviços e ambientes |

### 4.4 Componentes Envolvidos

- API Principal (Runtime Node.js)
- Webhook endpoint para Chatwoot
- Cliente OpenAI (GPT-4)
- Redis (estado de conversa)
- Postgres (armazenamento mínimo)
- Chatwoot (conta configurada)

### 4.5 Implementações Previstas

#### 4.5.1 Infraestrutura Base

- [ ] Setup de ambiente de desenvolvimento local
- [ ] Configuração de containers Docker
- [ ] Configuração de variáveis de ambiente
- [ ] Setup de banco de dados Postgres (schema mínimo)
- [ ] Setup de Redis para estado

#### 4.5.2 API do Runtime

- [ ] Servidor Express/Fastify na porta 3000
- [ ] Endpoint de webhook `/webhooks/chatwoot`
- [ ] Validação de webhook signature
- [ ] Normalização de mensagens
- [ ] Sistema de deduplicação (Redis)

#### 4.5.3 Integração Chatwoot

- [ ] Recebimento de webhooks (message_created, conversation_created)
- [ ] Envio de respostas via Chatwoot API
- [ ] Mapeamento de entidades (conversation, contact)
- [ ] Tratamento de status de conversa

#### 4.5.4 Integração OpenAI

- [ ] Cliente OpenAI configurado
- [ ] Sistema de prompt com persona (spec 02)
- [ ] Envio de mensagens para LLM
- [ ] Processamento de resposta
- [ ] Timeout e retry

#### 4.5.5 Observabilidade Inicial

- [ ] Logging estruturado (JSON)
- [ ] Healthcheck endpoint `/health`
- [ ] Correlation ID para rastreabilidade

### 4.6 Fora de Escopo

- Ferramentas do agente (implementadas na Phase 4)
- Memória persistente (Phase 2)
- RAG/Conhecimento (Phase 3)
- Handoff (Phase 4)
- Telegram (Phase 5)
- Segurança avançada (Phase 6)

### 4.7 Entregáveis

- [ ] API do agente rodando localmente
- [ ] Webhook configurado no Chatwoot
- [ ] Agente respondendo mensagens de teste
- [ ] Logs funcionando
- [ ] Healthcheck operacional

### 4.8 Critérios de Aceite

- [ ] Mensagem enviada ao Chatwoot chega ao agente
- [ ] Agente processa mensagem e retorna resposta
- [ ] Tempo de resposta < 30 segundos
- [ ] Logs estruturados gerados
- [ ] Healthcheck retorna status OK
- [ ] Deduplicação funcionando (mensagens duplicadas ignoradas)

### 4.9 Riscos Principais

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|----------|
| Latência alta do LLM | Média | Médio | Cache de respostas, fallback para modelo menor |
| Webhook não chega | Média | Alto | Verificar configuração Chatwoot, logs de rede |
| Respostas inconsistentes | Alta | Médio | Prompt engineering iterativo |
| Rate limiting Chatwoot | Média | Médio | Implementar controle de taxa |

### 4.10 Rollback Conceitual

Se integração Chatwoot ou OpenAI falhar: retornar ao setup de ambiente e validar credenciais. Se LLM retornar respostas incorretas: revisar prompt e iterar.

---

## 5. Fase 2 — Memória Persistente e Relacionamento

### 5.1 Objetivo

Implementar sistema de armazenamento persistente para dados de clientes (tutores) e seus animais de estimação, permitindo que o agente recupere informações em conversas futuras.

### 5.2 Dependências

- Phase 1 completa (runtime base funcionando)

### 5.3 Arquivos de Referência

| Arquivo | Seção Relevante |
|---------|----------------|
| `specs/01_SYSTEM_ARCHITECTURE.md` | Seção 2: Redis e Postgres |
| `specs/03_MEMORY_ARCHITECTURE.md` | Todo o documento |
| `specs/04_DATABASE_SCHEMA o documento |
| `specs/09_AGENT.md` | Todo_TOOLS.md` | Seções 1-6: Ferramentas de contato e pet |

### 5.4 Componentes Envolvidos

- Postgres (tabelas contacts, pets, customer_memories)
- Redis (cache de contexto)
- Ferramentas do agente (find_contact, create_or_update_contact, find_pet, create_or_update_pet)

### 5.5 Implementações Previstas

#### 5.5.1 Schema de Banco de Dados

- [ ] Criação de tabela contacts
- [ ] Criação de tabela pets
- [ ] Criação de tabela customer_memories
- [ ] Índices para queries frequentes
- [ ] Seed de dados para testes

#### 5.5.2 Ferramentas de Dados

- [ ] Implementação find_contact
- [ ] Implementação create_or_update_contact
- [ ] Implementação find_pet
- [ ] Implementação create_or_update_pet

#### 5.5.3 Memória de Curto Prazo

- [ ] Carregamento de contexto do Redis
- [ ] Salvamento de estado de conversa
- [ ] TTL configurado (24h para conversas)

#### 5.5.4 Memória Persistente

- [ ] Implementação save_memory
- [ ] Implementação list_memories
- [ ] Extração de facts (implícito)
- [ ] Confiança adaptativa (implícita)

### 5.6 Fora de Escopo

- Resumo de conversas (assíncrono)
- Versionamento de memories
- Integração com RAG

### 5.7 Entregáveis

- [ ] Tabela contacts funcionando com CRUD
- [ ] Tabela pets funcionando com CRUD
- [ ] Agent consegue buscar dados de cliente
- [ ] Agent consegue salvar novos clientes/pets
- [ ] Contexto carregado corretamente

### 5.8 Critérios de Aceite

- [ ] Cliente pode ser criado via agente
- [ ] Pet pode ser criado vinculado a tutor
- [ ] Dados são persistidos entre conversas
- [ ] Contexto carregado na conversa seguinte
- [ ] Busca por telefone/email funciona
- [ ] Busca por nome de pet funciona

### 5.9 Riscos Principais

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|----------|
| Dados duplicados | Média | Médio | Validação antes de criar |
| Performance com muitos dados | Baixa | Médio | Índices adequados, paginação |
| Dados inconsistentes | Média | Médio | Validação de entrada |

### 5.10 Rollback Conceitual

Se banco de dados apresentar problemas: revisar schema e migrations. Se extração de facts falhar: simplificar para confirmação explícita.

---

## 6. Fase 3 — RAG e Conhecimento Institucional

### 6.1 Objetivo

Implementar sistema de recuperação de conhecimento que permite ao agente buscar informações institucionais (FAQ, políticas, procedimentos) de forma semântica.

### 6.2 Dependências

- Phase 1 completa (runtime base)
- Phase 2 completa (memória funcional)

### 6.3 Arquivos de Referência

| Arquivo | Seção Relevante |
|---------|----------------|
| `specs/01_SYSTEM_ARCHITECTURE.md` | Seção 2: Vector Store |
| `specs/05_RAG_KNOWLEDGE_SYSTEM.md` | Todo o documento |
| `specs/09_AGENT_TOOLS.md` | Seção 7: search_knowledge |

### 6.4 Componentes Envolvidos

- Vector Store (Pinecone, Qdrant ou pgvector)
- Postgres (tabelas knowledge_documents, knowledge_chunks)
- OpenAI (text-embedding-3-small)
- Ferramenta search_knowledge

### 6.5 Implementações Previstas

#### 6.5.1 Infraestrutura RAG

- [ ] Setup de Vector Store (Pinecone/Qdrant)
- [ ] Configuração de embedding (1536 dimensões)
- [ ] indexes e namespace

#### 6.5.2 Schema de Conhecimento

- [ ] Tabela knowledge_documents
- [ ] Tabela knowledge_chunks
- [ ] Políticas de versionamento

#### 6.5.3 Pipeline de Ingestão

- [ ] Processo de chunking (500 tokens, 10% overlap)
- [ ] Geração de embeddings
- [ ] Salvamento no vector store

#### 6.5.4 Busca Semântica

- [ ] Implementação search_knowledge
- [ ] Busca por similaridade
- [ ] Threshold de relevância (0.7)
- [ ] Retorno de top-k chunks

#### 6.5.5 Base de Conhecimento Inicial

- [ ] Inserção de 50+ documentos FAQ
- [ ] Políticas do hospital
- [ ] Procedimentos e horários

### 6.6 Fora de Escopo

- Ingestão via Telegram (Phase 5)
- Versionamento avançado
- Reindexação completa

### 6.7 Entregáveis

- [ ] Vector Store configurado
- [ ] Busca semântica funcionando
- [ ] Agent consegue buscar conhecimento
- [ ] 50+ documentos na base
- [ ] Latência de busca < 2s

### 6.8 Critérios de Aceite

- [ ] Busca retorna documentos relevantes
- [ ] Agent usa conhecimento para responder
- [ ] Fallback quando não encontra informação
- [ ] Fonte indicada na resposta
- [ ] Latência aceitável

### 6.9 Riscos Principais

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|----------|
| Baixa precisão de busca | Alta | Médio | Iterar em chunking e prompts |
| Custo de embeddings | Alta | Médio | Cache de embeddings, batch |
| Vector store fora | Média | Alto | Fallback para Postgres full-text |

### 6.10 Rollback Conceitual

Se RAG apresentar baixa qualidade: adicionar fallback para busca em Postgres. Se Vector Store indisponível: implementar cache local.

---

## 7. Fase 4 — Secretaria Operacional e Handoff

### 7.1 Objetivo

Completar o ciclo operacional do agente com ferramentas de negócio, sistema de handoff para transferência humana, e fluxos conversacionais completos.

### 7.2 Dependências

- Phase 1 completa (runtime)
- Phase 2 completa (memória)
- Phase 3 completa (conhecimento)

### 7.3 Arquivos de Referência

| Arquivo | Seção Relevante |
|---------|----------------|
| `specs/02_AGENT_BEHAVIOR.md` | Todo o documento |
| `specs/08_HANDOFF_SYSTEM.md` | Todo o documento |
| `specs/09_AGENT_TOOLS.md` | Seções 8-14: Ferramentas operacionais |
| `specs/10_SECURITY_AND_GUARDRAILS.md` | Todo o documento |

### 7.4 Componentes Envolvidos

- Todas as ferramentas do agente
- Sistema de handoff
- Fluxos conversacionais
- Guardrails de segurança

### 7.5 Implementações Previstas

#### 7.5.1 Ferramentas Completas

- [ ] get_operational_rules
- [ ] create_handoff
- [ ] notify_sector
- [ ] create_followup_task
- [ ] log_summary

#### 7.5.2 Sistema de Handoff

- [ ] Detecção de urgência clínica
- [ ] Detecção de baixa confiança
- [ ] Geração de resumo estruturado
- [ ] Labels automáticos no Chatwoot
- [ ] Lock de conversa
- [ ] Retorno ao agente

#### 7.5.3 Guardrails

- [ ] Bloqueio de conteúdo clínico
- [ ] Respostas de fallback
- [ ] Mitigação de alucinação
- [ ] Rate limiting

#### 7.5.4 Fluxos Conversacionais

- [ ] Primeiro contato
- [ ] Solicitação de informações
- [ ] Dúvida clínica
- [ ] Reclamação
- [ ] Encaminhamento

### 7.6 Fora de Escopo

- Ingestão via Telegram
- Analytics avançado
- Multi-canal

### 7.7 Entregáveis

- [ ] Todas as ferramentas implementadas
- [ ] Handoff funcionando
- [ ] Guardrails ativos
- [ ] Fluxos conversacionais completos
- [ ] Taxa de automação ≥ 60%

### 7.8 Critérios de Aceite

- [ ] Emergência clínica aciona handoff imediato
- [ ] Reclamação escalona corretamente
- [ ] Baixa confiança detecta incerteza
- [ ] Resumo estruturado criado
- [ ] Lock evita resposta dupla
- [ ] Taxa de automação ≥ 60%

### 7.9 Riscos Principais

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|----------|
| Handoff desnecessário | Alta | Médio | Iterar thresholds de confiança |
| Handoff faltando | Média | Alto | Monitoramento de edge cases |
| Alucinação | Média | Alto | Guardrails reforçados |

### 7.10 Rollback Conceitual

Se handoff falhar: revisar critérios de detecção. Se guardrails falharem: adicionar mais validações.

---

## 8. Fase 5 — Ingestão via Telegram e Autoalimentação Governada

### 8.1 Objetivo

Permitir que administradores atualizem o conhecimento do agente via Telegram, criando um ciclo de melhoria contínua governado por aprovação.

### 8.2 Dependências

- Phase 3 completa (RAG)
- Phase 4 completa (funcionalidades operacionais)

### 8.3 Arquivos de Referência

| Arquivo | Seção Relevante |
|---------|----------------|
| `specs/07_TELEGRAM_INGESTION.md` | Todo o documento |
| `specs/09_AGENT_TOOLS.md` | Seção 13: ingest_telegram_content |

### 8.4 Componentes Envolvidos

- Bot Telegram
- Pipeline de classificação
- Sistema de aprovação
- Workers assíncronos

### 8.5 Implementações Previstas

#### 8.5.1 Bot Telegram

- [ ] Setup de Bot via BotFather
- [ ] Webhook para recebimento
- [ ] Comandos (/start, /help, /status, /reload, /stats)
- [ ] Processamento de texto
- [ ] Processamento de documentos

#### 8.5.2 Pipeline de Classificação

- [ ] Classificador automático (FAQ, política, procedimento, regra)
- [ ] Validação de conteúdo
- [ ] Extração de metadados

#### 8.5.3 Sistema de Aprovação

- [ ] Fluxo DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED
- [ ] Comandos de aprovação (/approve, /reject)
- [ ] Notificações

#### 8.5.4 Processamento

- [ ] Chunking de documentos
- [ ] Geração de embeddings
- [ ] Salvamento no Vector Store
- [ ] Versionamento

### 8.6 Fora de Escopo

- Multiunidade
- Multi-canal
- Analytics avançado

### 8.7 Entregáveis

- [ ] Bot Telegram configurado
- [ ] Fluxo de aprovação funcionando
- [ ] Admin consegue adicionar FAQ via Telegram
- [ ] Conteúdo publicado no RAG
- [ ] Sistema de versionamento

### 8.8 Critérios de Aceite

- [ ] Admin recebe mensagem no Telegram
- [ ] Classificação automática funciona
- [ ] Aprovação publica no RAG
- [ ] Busca retorna novo conteúdo
- [ ] Versionamento mantém histórico

### 8.9 Riscos Principais

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|----------|
| Conteúdo inadequado publicado | Média | Alto | Fluxo de aprovação mandatório |
| Bot indisponível | Baixa | Médio | Fallback para inserção manual |
| Classification errada | Média | Médio | Revisão mandatory |

### 8.10 Rollback Conceitual

Se classificação falhar: adicionar revisão manual. Se publicação falhar: implementar retry e DLQ.

---

## 9. Fase 6 — Segurança Avançada, Observabilidade e Maturidade Operacional

### 9.1 Objetivo

Elevar o sistema para nível de maturidade enterprise com segurança robusta, observabilidade completa e capacidades operacionais para produção.

### 9.2 Dependências

- Phase 1-5 completas

### 9.3 Arquivos de Referência

| Arquivo | Seção Relevante |
|---------|----------------|
| `specs/10_SECURITY_AND_GUARDRAILS.md` | Todo o documento |
| `specs/12_DEPLOYMENT_ARCHITECTURE.md` | Todo o documento |
| `specs/13_LOGGING_AND_OBSERVABILITY.md` | Todo o documento |

### 9.4 Componentes Envolvidos

- Segurança (LGPD, autenticação, rate limiting)
- Observabilidade (métricas, alertas, dashboards)
- Deploy (Kubernetes, CI/CD)
- Workers assíncronos

### 9.5 Implementações Previstas

#### 9.5.1 Segurança Avançada

- [ ] Autenticação em todos os endpoints
- [ ] Criptografia de dados sensíveis (CPF)
- [ ] Rate limiting por cliente
- [ ] Validação de input completa
- [ ] Logs de auditoria
- [ ] Máscaramento de dados

#### 9.5.2 Observabilidade

- [ ] Métricas Prometheus/Grafana
- [ ] Dashboards operacionais
- [ ] Alertas (erro, latência, handoff)
- [ ] APM (tracing)
- [ ] Logs estruturados completos

#### 9.5.3 Deploy production-ready

- [ ] Kubernetes/Helm charts
- [ ] CI/CD pipeline
- [ ] Healthchecks (readiness/liveness)
- [ ] Rollback automatizado
- [ ] Zero-downtime deploy

#### 9.5.4 Workers Assíncronos

- [ ] BullMQ configurado
- [ ] Resumo de conversas
- [ ] Extração de memories
- [ ] Retry com backoff
- [ ] Dead letter queue

### 9.6 Fora de Escopo

- Escalabilidade multi-region
- Disaster recovery avançado
- Compliance certification

### 9.7 Entregáveis

- [ ] Sistema em produção com segurança
- [ ] Dashboards operacionais
- [ ] Alertas configurados
- [ ] CI/CD funcionando
- [ ] Uptime ≥ 99.5%

### 9.8 Critérios de Aceite

- [ ] Segurança validada
- [ ] Dashboards showing métricas
- [ ] Alertas funcionando
- [ ] Deploy automatizado
- [ ] Uptime ≥ 99.5%
- [ ] Tempo de resposta < 30s

### 9.9 Riscos Principais

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|----------|
| Dados expostos | Baixa | Crítico | Auditoria de segurança |
| Sistema fora | Média | Alto | Multi-region, failover |
| Custos inesperados | Alta | Médio | Monitoramento de custos |

### 9.10 Rollback Conceitual

Se segurança falhar: isolly affected components. Se deploy falhar: rollback automático.

---

## 10. Ordem Recomendada de Execução

A ordem recomendada segue a dependência natural das fases:

```
Phase 0 (Semanas 1-2)
    │
    ▼
Phase 1 (Semanas 3-6)
    │
    ▼
Phase 2 (Semanas 7-10)
    │
    ▼
Phase 3 (Semanas 11-14)
    │
    ▼
Phase 4 (Semanas 15-20)
    │
    ▼
Phase 5 (Semanas 21-24)
    │
    ▼
Phase 6 (Semanas 25-30)
```

### Timeline Estimada

| Fase | Duração | Acumulado |
|------|---------|----------|
| Phase 0 | 2 semanas | 2 semanas |
| Phase 1 | 4 semanas | 6 semanas |
| Phase 2 | 4 semanas | 10 semanas |
| Phase 3 | 4 semanas | 14 semanas |
| Phase 4 | 6 semanas | 20 semanas |
| Phase 5 | 4 semanas | 24 semanas |
| Phase 6 | 6 semanas | 30 semanas |

---

## 11. Regras de Transição Entre Fases

### 11.1 Regra 1: Aceite Formal da Fase Anterior

Nenhuma nova fase deve ser iniciada sem que a fase anterior tenha seus critérios de aceite atendidos e validados formalmente. A validação deve incluir:

- Testes unitários passando
- Testes de integração passando
- Testes manuais de critério de aceite
- Documentação atualizada (se aplicável)

### 11.2 Regra 2: Estabilidade Antes de Expansão

O escopo de uma fase não deve ser expandido após o início da implementação sem justificativa formal e aprovação. Alterações de escopo devem ser:

- Documentadas no documento de mudança
- Avaliadas quanto a impacto no cronograma
- Aprovadas pelo responsável técnico

### 11.3 Regra 3: Atualização de Specs Quando Necessário

Se durante a implementação houver divergência entre o código e a especificação, o spec deve ser atualizado para refletir a realidade implementada:

- Documente a divergência
- Atualize o spec com a correção
- Marque a correção no registro de mudanças

### 11.4 Regra 4: Critérios de Bloco

Uma fase pode ser bloqueada se:

- Bugs críticos descobertos na fase anterior
- Dependência externa indisponível
- Mudança significativa de prioridade de negócio
- Recursos insuficientes para continuar

### 11.5 Regra 5: Documentação Progressiva

Cada fase concluída deve atualizar:

- README.md do projeto
- CHANGELOG.md
- Diagrama de arquitetura (se mudou)

---

## 12. Governança de Mudanças

### 12.1 Specs como Fonte da Verdade

Os documentos de especificação em `/specs/` são a fonte oficial e autorizada do projeto. Todas as implementações devem seguir os specs.

### 12.2 Código Deve Seguir Specs

O código implementado deve ser consistente com as especificações. Quando o código divergir do spec por motivo justificado, o spec deve ser atualizado primeiro.

### 12.3 Divergência Exige Atualização Explícita

Se durante a implementação for identificada a necessidade de divergir do spec:

1. Documente a razão da divergência
2. Proponha a alteração no spec
3. Obtenha aprovação para a alteração
4. Atualize o spec
5. Implemente a mudança

### 12.4 Mudanças Relevantes Devem Atualizar Documentação

Toda mudança significativa deve atualizar a documentação:

- **Antes**: Se a mudança é planejada, atualizar spec primeiro
- **Junto**: Se a mudança é urgente, documentar junto com código
- **Depois**: Se a mudança foi implementada sem documentação, criar follow-up

### 12.5 Registro de Mudanças

Todas as mudanças de spec devem ser registradas no cabeçalho do documento:

```markdown
## Registro de Mudanças

| Data | Versão | Mudança | Autor |
|------|--------|---------|-------|
| YYYY-MM-DD | 1.0 | Versão inicial | Nome |
| YYYY-MM-DD | 1.1 | Correção identificadas | Nome |
```

---

## 13. Glossário de Termos

| Termo | Definição |
|-------|-----------|
| **Agent** | O assistente virtual Luna do hospital veterinário |
| **Chatwoot** | Plataforma de atendimento ao cliente |
| **Contact** | Tutor/cliente do hospital |
| **Customer Memory** | Fact persistente sobre cliente ou pet |
| **Fact** | Informação estruturada extraída de conversa |
| **Handoff** | Transferência de conversa do agente para humano |
| **RAG** | Retrieval Augmented Generation |
| **Vector Store** | Banco de dados de embeddings |
| **Chunk** | Trecho de documento para busca semântica |
| **Worker** | Processo assíncrono para jobs de longa duração |

---

## 14. Referência de Arquivos

| Arquivo | Conteúdo |
|---------|-----------|
| `specs/00_VISION.md` | Visão do produto |
| `specs/01_SYSTEM_ARCHITECTURE.md` | Arquitetura do sistema |
| `specs/02_AGENT_BEHAVIOR.md` | Comportamento do agente |
| `specs/03_MEMORY_ARCHITECTURE.md` | Arquitetura de memória |
| `specs/04_DATABASE_SCHEMA.md` | Schema do banco de dados |
| `specs/05_RAG_KNOWLEDGE_SYSTEM.md` | Sistema de conhecimento RAG |
| `specs/06_CHATWOOT_INTEGRATION.md` | Integração Chatwoot |
| `specs/07_TELEGRAM_INGESTION.md` | Ingestão Telegram |
| `specs/08_HANDOFF_SYSTEM.md` | Sistema de handoff |
| `specs/09_AGENT_TOOLS.md` | Ferramentas do agente |
| `specs/10_SECURITY_AND_GUARDRAILS.md` | Segurança e guardrails |
| `specs/11_AGENT_RUNTIME_FLOW.md` | Fluxo de execução |
| `specs/12_DEPLOYMENT_ARCHITECTURE.md` | Arquitetura de deploy |
| `specs/13_LOGGING_AND_OBSERVABILITY.md` | Logging e observabilidade |
| `specs/14_ROADMAP.md` | Roadmap do projeto |
| `specs/PHASES.md` | Este documento |

---

## 15. Registro de Mudanças

| Data | Versão | Mudança | Autor |
|------|--------|---------|-------|
| 2024-01-15 | 1.0 | Versão inicial do PHASES.md | CVG Secretary Agent Team |
