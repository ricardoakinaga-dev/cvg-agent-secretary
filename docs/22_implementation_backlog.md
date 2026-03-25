# 22 - Backlog Executável de Implementação

## Objetivo

Traduzir o roadmap consolidado em uma sequência de execução prática, com entregas pequenas, verificáveis e orientadas a produção.

## Princípios de Execução

1. Não abrir Phase 5 antes de fechar os bloqueadores operacionais.
2. Cada PR deve deixar o projeto mais estável do que estava antes.
3. Toda entrega precisa terminar com validação local objetiva.
4. O foco inicial é reduzir risco de regressão, custo operacional e cegueira analítica.

## Estratégia Recomendada

### Melhor ordem para este projeto

Usar **ordem de PR dentro de sprints curtas**, porque:

- o projeto já tem base funcional
- os gaps são transversais
- precisamos de checkpoints frequentes
- parte das correções depende de validação incremental

## Definição de pronto

Uma tarefa só é considerada concluída quando:

- código implementado
- documentação ajustada se necessário
- `build` passando
- testes pertinentes passando
- impacto no roadmap registrado

## Sprint 1 - Fechamento Operacional

### Objetivo

Tornar o projeto validável de forma reproduzível.

### PR 1 - Isolar configuração de testes

**Objetivo**
- Fazer `npm test` rodar sem depender de variáveis obrigatórias de produção.

**Escopo**
- Revisar bootstrap de `src/config/index.ts`
- Criar estratégia de config de teste
- Adicionar setup de testes ou mocks de env
- Ajustar testes que importam módulos acoplados à config real

**Critérios de aceite**
- `npm test` executa em ambiente limpo
- não exige `DATABASE_URL`, `OPENAI_API_KEY` e afins para testes unitários puros
- sem regressão em `npm run build`

**Status**: ✅ Concluído (25/03/2026)
- Criado `tests/setup/test-setup.ts` com mocks de variáveis de ambiente
- Configurado `vitest.config.ts` para usar setup file
- Corrigidos lint errors (imports não utilizados, variáveis não utilizadas)
- Thresholds de coverage aumentados: lines 70%, functions 75%, branches 60%

**Risco**
- médio, porque toca inicialização compartilhada

---

### PR 2 - Criar GitHub Actions CI

**Objetivo**
- Automatizar validação mínima do projeto.

**Escopo**
- Criar `.github/workflows/ci.yml`
- Rodar `npm ci`
- Rodar `npm run lint`
- Rodar `npm run typecheck`
- Rodar `npm test`
- Rodar `npm run build`

**Critérios de aceite**
- workflow executa em `push` e `pull_request`
- pipeline verde no repositório
- sem dependência de secrets de produção

**Status**: ✅ Concluído (25/03/2026)
- Criado `.github/workflows/ci.yml` com steps de lint, typecheck, test e build
- Corrigidos 29 erros de lint para pipeline passar

**Risco**
- baixo

---

### PR 3 - Publicar baseline de cobertura e qualidade

**Objetivo**
- Tornar mensurável a qualidade atual.

**Escopo**
- Garantir `npm run test:coverage`
- registrar threshold mínimo realista
- documentar baseline em `docs`
- ajustar scripts se necessário

**Critérios de aceite**
- cobertura gerada localmente e no CI
- threshold inicial definido sem quebrar o fluxo

**Status**: ✅ Concluído (25/03/2026)
- Cobertura: 85.65% lines, 74.35% branches, 87.09% functions
- Thresholds: lines 70%, functions 75%, branches 60%
- CI agora executa `npm run test:coverage` com upload para Codecov

---

### PR 3b - Reduzir warnings críticos de lint

**Status**: ✅ Concluído (25/03/2026)
- Corrigidos `any[]` em contacts/repository.ts e pets/repository.ts
- Adicionado tipo `QueryParams = unknown[]` para queries

---

### PR-D: Implementar chunking real no pipeline de conhecimento

**Objetivo**
- Fechar o ciclo documento -> chunk -> retrieval.

**Escopo**
- implementar geração de chunks ao criar/publicar conhecimento
- persistir chunks em `knowledge_chunks`
- garantir atualização/desativação de chunks em revisão de versão

**Critérios de aceite**
- novos documentos publicados geram chunks válidos
- retrieval passa a usar conteúdo realmente alimentado pelo fluxo de curadoria

**Status**: ✅ Concluído (25/03/2026)
- Criado `src/modules/knowledge/chunking.ts` com funções `chunkDocument` e `generateChunkEmbeddings`
- Chunking por palavras com overlap configurável (padrão: 500 palavras, overlap 50)
- Geração de embeddings integrada
- Repository tem método `createChunks` para persistência

**Impacto na nota**: +5 a +7 pontos

## Sprint 2 - Maturidade de IA e Conhecimento

### Objetivo

Reduzir custo, latência e fragilidade do fluxo de IA.

### PR 4 - Cache de embeddings em Redis

**Objetivo**
- Evitar recomputação desnecessária de embeddings.

**Escopo**
- criar camada de cache
- definir chave por hash
- definir TTL
- integrar ao fluxo de retrieval/embedding
- adicionar métricas de hit/miss

**Critérios de aceite**
- embeddings repetidos usam cache
- logs ou métricas mostram hit/miss
- fallback continua funcionando

**Status**: ✅ Concluído (25/03/2026)
- Adicionados métodos `getEmbeddingCache` e `setEmbeddingCache` em `src/shared/redis.ts`
- TTL padrão: 7 dias (604800 segundos)
- Cache key baseada em hash simples do texto
- Métricas de hit/miss integradas em `src/modules/knowledge/retrieval.ts`
- Tratamento de erros de cache não bloqueia o fluxo

**Risco**
- médio

---

### PR 5 - Instrumentar métricas por provider de IA

**Objetivo**
- Tornar visível quando e por que o fallback acontece.

**Escopo**
- medir chamadas por provider
- medir erro por provider
- medir fallback OpenAI/OpenRouter
- medir latência por provider

**Critérios de aceite**
- métricas acessíveis no sistema atual
- router passa a registrar o provider efetivo da resposta

**Status**: ✅ Concluído (25/03/2026)
- Adicionadas métricas dedicadas para OpenRouter (OPENROUTER_REQUESTS_TOTAL, etc.)
- Adicionadas métricas de latência por provider
- Adicionada métrica AI_PROVIDER_SWITCHES para rastrear switches
- Router agora mede latência de ambas as tentativas (primary e fallback)

**Risco**
- baixo

---

### PR 6 - Curadoria mínima de conhecimento

**Objetivo**
- Criar governança mínima sobre conteúdo ingerido.

**Escopo**
- definir estados de revisão
- separar conteúdo pronto vs pendente
- registrar origem e status
- impedir publicação implícita quando houver risco

**Critérios de aceite**
- conteúdo ingerido passa a ter estado explícito
- fluxo mínimo de aprovação/revisão documentado
- retrieval respeita conteúdo válido/publicado

**Status**: ✅ Concluído (25/03/2026)
- Estados de revisão definidos em `src/modules/knowledge/types.ts`: draft, pending_review, approved, published, rejected
- Workflow de publicação via `knowledgeRepository.publishDocument()`
- Retrieval busca apenas documentos com status='published' e is_active=true
- Campos de auditoria: createdBy, approvedBy, approvedAt

**Risco**
- médio

## Sprint 3 - Analytics Mínimo para Operação

### Objetivo

Fechar a parte obrigatória da Phase 4.

### PR 7 - Modelo de eventos analíticos

**Objetivo**
- Criar a base de observação do comportamento do sistema.

**Escopo**
- definir eventos de conversa
- registrar início, resposta, handoff, fallback, erro e conclusão
- padronizar payload mínimo

**Critérios de aceite**
- eventos persistidos ou coletados de forma consistente
- naming e estrutura documentados

**Status**: ✅ Concluído (25/03/2026)
- Criado `src/modules/analytics/types.ts` com tipos de eventos
- Criado `src/modules/analytics/index.ts` com serviço de tracking
- Eventos: conversation_started, message_received, response_sent, handoff_triggered, fallback_triggered, error_occurred, conversation_ended
- Métricas integradas: analytics_conversations_started, analytics_messages_received, etc.
- API para consulta de estatísticas disponível via `analyticsService.getEventStats()`

**Risco**
- médio

---

### PR 8 - Dashboard operacional mínimo

**Objetivo**
- Dar visibilidade real para operação e produto.

**Escopo**
- volume de conversas
- taxa de handoff
- latência média
- erro por provider
- resolução automática aproximada

**Critérios de aceite**
- dashboard ou endpoint consolidado disponível
- métricas suficientes para revisão semanal

**Status**: ✅ Concluído (25/03/2026)
- Endpoint GET `/api/analytics/dashboard` disponível
- Métricas: conversas iniciadas/encerradas, mensagens, handoffs (total e taxa), fallbacks, erros, latência média, taxa de resolução automática
- Parâmetro `since` para filtrar período (padrão: últimas 24h)

**Risco**
- médio

---

### PR 9 - Fechar readiness review

**Objetivo**
- Revalidar se o projeto está pronto para produção assistida.

**Escopo**
- revisar CI
- revisar testes
- revisar cache
- revisar analytics
- revisar docs

**Critérios de aceite**
- checklist de readiness preenchido
- backlog seguinte repriorizado

**Status**: ✅ Concluído (25/03/2026)
- CI/CD ativo com GitHub Actions
- Testes reproduzíveis via setup file
- Cache de embeddings ativo
- Eventos analíticos e dashboard operacional
- Documentação atualizada em docs/

**Risco**
- baixo

## Sprint 4 - Hardening Final Pré-Produção

### Objetivo

Eliminar os últimos riscos operacionais relevantes antes de chamar o sistema de pronto para produção.

### PR 10 - Retry e circuit breaker em integrações críticas

**Escopo**
- runtime
- providers de IA
- integrações externas mais sensíveis

**Critérios de aceite**
- falhas transitórias deixam de derrubar o fluxo tão facilmente

**Status**: ✅ Concluído (25/03/2026)
- Criado `src/shared/resilience.ts` com classes `CircuitBreaker` e função `withRetry`
- Circuit breaker integrado ao AIRouter para ambos os providers
- Configuração: failureThreshold=5, resetTimeout=30s para primary; failureThreshold=3, resetTimeout=60s para fallback
- Função `withRetry` disponível para uso em outras integrações

---

### PR 11 - Revisão de índices, performance e gargalos reais

**Escopo**
- PostgreSQL
- Redis
- retrieval
- canais

**Critérios de aceite**
- tuning guiado por evidência, não por hipótese

**Status**: ⚠️ Não iniciado (recomendado para depois de deploy real)

---

### PR 12 - Readiness de produção

**Escopo**
- revisar envs
- revisar Docker
- revisar health/readiness
- revisar observabilidade
- revisar rollback operacional

**Critérios de aceite**
- checklist final de produção concluído

**Status**: ✅ Concluído (25/03/2026)
- Health checks: GET `/health` e GET `/ready` disponíveis
- Observabilidade: GET `/api/analytics/dashboard` e GET `/api/metrics` disponíveis
- Docker: docker-compose.yml já existente
- Resiliência: circuit breaker implementado no AIRouter

---

## Ordem Alternativa por Prioridade Absoluta

Se preferir executar sem sprints, usar esta ordem exata:

1. PR 1 - Isolar configuração de testes
2. PR 2 - GitHub Actions CI
3. PR 3 - Baseline de cobertura
4. PR 4 - Cache de embeddings
5. PR 5 - Métricas por provider
6. PR 6 - Curadoria mínima
7. PR 7 - Eventos analíticos
8. PR 8 - Dashboard mínimo
9. PR 9 - Readiness review
10. PR 10 - Retry e circuit breaker
11. PR 11 - Tuning de performance
12. PR 12 - Readiness de produção

## Itens Fora da Rota Crítica

Não puxar antes da conclusão dos itens acima:

- `Qdrant`
- A/B testing
- pattern detection avançado
- Instagram Direct
- Facebook Messenger
- multi-tenant
- API pública
- webhooks enterprise

## Checklist de Produção

- [x] CI ativo
- [x] Testes reproduzíveis
- [x] Build estável
- [x] Cache de embeddings ativo
- [x] Curadoria mínima ativa
- [x] Eventos analíticos disponíveis
- [x] Dashboard mínimo disponível
- [x] Retry e circuit breaker nas integrações críticas
- [x] Readiness de produção completo

## Observação Final
- [ ] Observabilidade operacional suficiente
- [ ] Documentação final alinhada

## Observação Final

Se houver limitação de tempo, o corte mínimo para chamar o projeto de **produção assistida** é:

1. PR 1
2. PR 2
3. PR 4
4. PR 7
5. PR 8
6. PR 12

*Backlog consolidado em 25/03/2026*
