# 24 - Plano de Correção Priorizado

## Objetivo

Converter o relatório de inspeção em uma sequência de correção exata para elevar a nota do projeto de **68/100** para **85+/100** e deixá-lo em estado de **produção assistida real**.

## Meta de Saída

Ao final deste plano, o projeto deve atender estes critérios:

- testes representativos rodando no CI
- coverage real e confiável
- analytics integrado ao runtime
- curadoria e retrieval fechando o ciclo fim a fim
- hardening operacional suficiente para produção assistida
- documentação refletindo o estado real

## Estratégia

### Regra principal

Corrigir primeiro o que hoje cria **falsa sensação de entrega**, depois o que impede **operação real**, e só então o que melhora **robustez e produção**.

## Ordem Exata de Execução

## Etapa 1 - Corrigir a confiabilidade da qualidade

### 1. Expandir a execução de testes reais

**Objetivo**
- Fazer o comando oficial de testes refletir melhor o sistema real.

**Ações**
- revisar `vitest.config.ts`
- incluir testes hoje excluídos que sejam estáveis
- separar claramente testes unitários, integração leve e testes dependentes de infraestrutura
- ajustar setup/mocks para permitir execução reprodutível

**Critério de aceite**
- `npm test` cobre mais do que `tests/unit`
- a suíte oficial deixa de parecer maior do que realmente executa

**Impacto esperado na nota**
- +4 a +6 pontos

---

### 2. Corrigir coverage no CI

**Objetivo**
- Fazer o pipeline publicar cobertura real e confiável.

**Ações**
- trocar `npm test` por `npm run test:coverage` no workflow ou adicionar etapa dedicada
- validar a geração de `coverage/coverage-final.json`
- garantir consistência entre saída local e CI

**Critério de aceite**
- o CI gera coverage de verdade
- upload de coverage deixa de depender de artefato inexistente

**Impacto esperado na nota**
- +2 a +4 pontos

---

### 3. Reduzir warnings críticos de lint

**Objetivo**
- remover dívida técnica que afeta segurança de evolução.

**Ações**
- atacar primeiro os `any` em:
  - `src/modules/contacts/repository.ts`
  - `src/modules/memory/repository.ts`
  - `src/modules/pets/repository.ts`
  - `src/modules/openai/client.ts`
  - `src/modules/intelligence/learning.ts`
- transformar warnings mais sensíveis em erros apenas depois da limpeza

**Critério de aceite**
- warnings reduzidos drasticamente
- módulos centrais deixam de depender de `any`

**Impacto esperado na nota**
- +3 a +5 pontos

## Etapa 2 - Fechar a Phase 2 de forma real

### 4. Conectar ingestão com chunking real

**Objetivo**
- Fechar o ciclo documento -> chunk -> retrieval.

**Ações**
- implementar geração de chunks ao criar/publicar conhecimento
- persistir chunks em `knowledge_chunks`
- garantir atualização/desativação de chunks em revisão de versão

**Critério de aceite**
- novos documentos publicados geram chunks válidos
- retrieval passa a usar conteúdo realmente alimentado pelo fluxo de curadoria

**Impacto esperado na nota**
- +5 a +7 pontos

---

### 5. Reajustar cache de embeddings para ganho operacional real

**Objetivo**
- Fazer o cache gerar benefício concreto.

**Ações**
- validar quando embeddings são realmente necessários no retrieval atual
- ou integrar embedding em caminho efetivo de busca
- ou rebaixar o cache para feature auxiliar até o vector path existir
- adicionar métrica de hit/miss realmente útil

**Critério de aceite**
- cache deixa de ser apenas estrutural
- benefício técnico mensurável documentado

**Impacto esperado na nota**
- +2 a +4 pontos

---

### 6. Fechar a curadoria ponta a ponta

**Objetivo**
- Transformar a governança de conhecimento em fluxo operacional completo.

**Ações**
- revisar `telegram-ingestion/service.ts`
- garantir transição correta `draft/pending_review/approved/published/rejected`
- assegurar vínculo entre aprovação, publicação e ativação de chunks
- revisar inconsistências de nomenclatura como `OperationalRuleId`

**Critério de aceite**
- conteúdo ingerido só entra no retrieval após fluxo válido
- trilha de auditoria mínima preservada

**Impacto esperado na nota**
- +3 a +5 pontos

## Etapa 3 - Fechar a Phase 4 de forma real

### 7. Integrar analytics ao runtime

**Objetivo**
- Fazer os eventos analíticos nascerem do fluxo principal.

**Ações**
- inserir `analyticsService.trackEvent(...)` em `agentRuntime`
- registrar:
  - início de conversa
  - mensagem recebida
  - resposta enviada
  - fallback
  - erro
  - handoff
  - encerramento

**Critério de aceite**
- o endpoint analítico passa a refletir eventos reais do runtime

**Impacto esperado na nota**
- +5 a +7 pontos

---

### 8. Persistir analytics fora da memória

**Objetivo**
- Tornar analytics útil além do ciclo de vida do processo.

**Ações**
- criar tabela ou persistência apropriada
- salvar eventos essenciais
- manter agregação simples para dashboard

**Critério de aceite**
- reinício da aplicação não zera histórico analítico
- dashboard passa a refletir operação de verdade

**Impacto esperado na nota**
- +4 a +6 pontos

---

### 9. Integrar learning loop ao fluxo operacional

**Objetivo**
- Transformar inteligência em melhoria contínua real.

**Ações**
- conectar gravação de feedback a eventos reais ou processos de revisão
- integrar falhas de provider, retrieval e classificação
- documentar o uso operacional do módulo

**Critério de aceite**
- learning loop deixa de ser módulo isolado
- existe caminho claro de alimentação dos dados

**Impacto esperado na nota**
- +2 a +4 pontos

## Etapa 4 - Fechar readiness de produção

### 10. Corrigir Dockerfile para build reprodutível

**Objetivo**
- Evitar imagem quebrada ou build inconsistente.

**Ações**
- revisar estratégia de build
- preferir multi-stage build ou instalar dependências adequadas para compilar
- garantir que a imagem final suba apenas com artefatos necessários

**Critério de aceite**
- imagem builda em ambiente limpo
- container sobe com previsibilidade

**Impacto esperado na nota**
- +2 a +4 pontos

---

### 11. Alinhar versões de runtime entre CI e Docker

**Objetivo**
- Eliminar divergência de ambiente.

**Ações**
- escolher versão alvo de Node
- alinhar `Dockerfile`, CI e documentação

**Critério de aceite**
- CI e container usam baseline compatível

**Impacto esperado na nota**
- +1 a +2 pontos

---

### 12. Revisar health/readiness com dependências reais

**Objetivo**
- Tornar health checks confiáveis para produção.

**Ações**
- revisar comentário/estado de Postgres
- checar readiness para dependências realmente críticas
- garantir coerência entre `/health`, `/ready` e operação do sistema

**Critério de aceite**
- health e readiness refletem o estado real do serviço

**Impacto esperado na nota**
- +2 a +3 pontos

---

### 13. Formalizar checklist final de produção assistida

**Objetivo**
- Encerrar o ciclo com um gate operacional real.

**Ações**
- criar checklist final em `docs`
- validar CI, testes, Docker, envs, métricas, analytics e rollback
- registrar pendências remanescentes fora da rota crítica

**Critério de aceite**
- existe um documento final de readiness assinado pelo estado real do código

**Impacto esperado na nota**
- +2 a +3 pontos

## Sequência Recomendada por PR

1. PR-A: Expandir testes reais + ajustar `vitest.config.ts`
2. PR-B: Corrigir coverage no CI
3. PR-C: Reduzir warnings críticos de lint
4. PR-D: Implementar chunking real no pipeline de conhecimento
5. PR-E: Fechar curadoria ponta a ponta
6. PR-F: Ajustar cache de embeddings para ganho real
7. PR-G: Integrar analytics no runtime
8. PR-H: Persistir analytics
9. PR-I: Integrar learning loop ao fluxo
10. PR-J: Corrigir Dockerfile e alinhar Node versions
11. PR-K: Revisar health/readiness
12. PR-L: Publicar checklist final de produção assistida

## Meta de Nota por Marco

| Marco | Nota alvo |
|------|-----------|
| Após Etapa 1 | 75+ |
| Após Etapa 2 | 80+ |
| Após Etapa 3 | 84+ |
| Após Etapa 4 | 85-90 |

## Itens Que Não Devem Entrar Antes Disso

- Qdrant
- A/B testing
- pattern detection avançado
- Instagram Direct
- Facebook Messenger
- multi-tenant
- API pública
- webhooks enterprise

## Definição de Projeto Pronto para Produção Assistida

O projeto só deve ser chamado de pronto para produção assistida quando:

- a suíte de testes oficial representar o sistema com honestidade
- o pipeline CI validar build, lint, testes e coverage reais
- o fluxo de conhecimento estiver fechado de ponta a ponta
- o dashboard analítico refletir eventos reais persistidos
- a imagem de execução for reproduzível
- health/readiness forem confiáveis
- a documentação final estiver coerente

## Recomendação Final

Se o objetivo for maximizar ganho rápido de nota e maturidade, atacar nesta ordem:

1. testes reais
2. coverage real
3. analytics no runtime
4. chunking + curadoria
5. readiness de produção

Essa combinação é a que mais rapidamente tira o projeto da zona de “estrutura boa com integração parcial” e leva para “produto tecnicamente confiável”.

*Plano gerado em 25/03/2026*
