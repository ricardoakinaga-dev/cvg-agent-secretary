# 28 - Plano Final de Fechamento dos Gaps

## Objetivo

Fechar apenas os gaps restantes que impedem o projeto de sair de **74/100** para **85+/100** de forma honesta, técnica e sustentável.

## Princípio

Neste estágio, não precisamos de novas frentes. Precisamos de **fechamento real** do que já existe parcialmente:

1. testes mais representativos
2. pipeline de conhecimento ponta a ponta
3. analytics persistido e confiável
4. readiness real de produção

## Meta Final

Ao concluir este plano, o projeto deve poder ser classificado com segurança como:

- **85+/100**
- **produção assistida real**

## Gaps Restantes Que Realmente Importam

| Gap | Impacto na nota | Prioridade |
|-----|------------------|------------|
| Suíte oficial de testes estreita | Alto | P0 |
| Chunking sem integração comprovada no fluxo | Alto | P0 |
| Analytics sem persistência | Alto | P0 |
| Health/readiness incompletos | Alto | P0 |
| Dockerfile com risco de build inconsistente | Médio | P1 |
| Learning loop sem integração real | Médio | P1 |
| Warnings de lint remanescentes | Médio | P1 |

## Ordem Exata de Execução

## Bloco 1 - Honestidade da qualidade

### 1. Expandir a suíte oficial de testes

**Objetivo**
- Fazer `npm test` representar melhor o sistema real.

**Executar**
- revisar `vitest.config.ts`
- incluir testes hoje excluídos que sejam estáveis
- separar testes por categoria se necessário
- manter reproduzibilidade com `tests/setup/test-setup.ts`

**Critério de aceite**
- a suíte oficial cobre mais módulos centrais
- `npm test` continua verde
- coverage continua acima dos thresholds atuais

**Ganho esperado**
- +4 a +6 pontos

---

### 2. Revisar e ajustar thresholds após expansão real

**Objetivo**
- Garantir que os thresholds representem a nova malha de testes.

**Executar**
- revalidar `lines`, `functions`, `branches`
- evitar thresholds artificiais

**Critério de aceite**
- CI continua confiável
- coverage deixa de depender de escopo estreito

**Ganho esperado**
- +1 a +2 pontos

## Bloco 2 - Fechar o pipeline de conhecimento

### 3. Integrar chunking ao fluxo de ingestão/publicação

**Objetivo**
- Fechar documento -> chunk -> embedding -> persistência -> retrieval.

**Executar**
- conectar `chunkDocument()` e `generateChunkEmbeddings()` ao fluxo de publicação
- persistir com `knowledgeRepository.createChunks()`
- garantir desativação/atualização correta em revisões

**Critério de aceite**
- documento publicado gera chunks reais
- retrieval passa a depender do pipeline fechado

**Ganho esperado**
- +5 a +7 pontos

---

### 4. Validar curadoria ponta a ponta ✅ CONCLUÍDO

**Objetivo**
- Garantir que conteúdo só entre em uso quando aprovado e publicado corretamente.

**Executar**
- revisar `telegram-ingestion/service.ts`
- garantir consistência entre status de ingestão, publicação e chunks
- corrigir inconsistências residuais de nomenclatura e ligação entre entidades

**Implementado**
- Corrigido fluxo de aprovação: agora o status da ingestão é atualizado para 'published' quando o documento é publicado
- Antes: ingestion ficava em 'approved' após publication
- Depois: ingestion é atualizada para 'published' junto com o documento
- Chunking integrado ao fluxo de publicação via `pipeline.ts`

**Critério de aceite**
- ✅ aprovação aciona publicação útil
- ✅ conteúdo publicado está realmente disponível para busca

**Arquivos modificados**
- `src/modules/telegram-ingestion/service.ts` - fluxo de aprovação atualizado

**Ganho realizado**
- +3 a +4 pontos

## Bloco 3 - Fechar analytics de verdade

### 5. Persistir eventos analíticos

**Objetivo**
- Tirar analytics da memória volátil do processo.

**Executar**
- criar tabela para eventos analíticos
- persistir eventos emitidos pelo runtime
- adaptar `analyticsService` para leitura persistida

**Critério de aceite**
- reinício da aplicação não zera analytics
- dashboard passa a refletir histórico real

**Ganho esperado**
- +4 a +6 pontos

---

### 6. Completar eventos operacionais faltantes

**Objetivo**
- Cobrir o fluxo principal com eventos suficientes para operação.

**Executar**
- garantir emissão de:
  - fallback
  - handoff
  - encerramento de conversa
  - falhas de integração críticas

**Critério de aceite**
- o dashboard consegue refletir comportamento operacional real

**Ganho esperado**
- +2 a +3 pontos

---

### 7. Integrar learning loop ao fluxo real

**Objetivo**
- Tirar o módulo de intelligence do isolamento.

**Executar**
- conectar feedback/falhas reais ao `learningLoopService`
- definir o ponto mínimo de gravação operacional

**Critério de aceite**
- o módulo recebe dados reais do sistema

**Ganho esperado**
- +2 a +3 pontos

## Bloco 4 - Fechar produção assistida de verdade

### 8. Corrigir Dockerfile para build reprodutível

**Objetivo**
- Garantir imagem confiável em ambiente limpo.

**Executar**
- revisar estratégia atual de build
- preferir multi-stage build ou instalação adequada de dependências para compilar
- validar build de imagem do zero

**Critério de aceite**
- container builda e sobe de forma reproduzível

**Ganho esperado**
- +2 a +3 pontos

---

### 9. Revisar health e readiness com dependências reais

**Objetivo**
- Fazer `/health` e `/ready` refletirem a operação real.

**Executar**
- incluir Postgres de forma correta
- revisar o que é obrigatório para readiness
- remover comentários/estado legado

**Critério de aceite**
- health/readiness passam a ser confiáveis para operação supervisionada

**Ganho esperado**
- +2 a +4 pontos

---

### 10. Reduzir warnings restantes de lint nos módulos centrais

**Objetivo**
- Melhorar segurança de evolução antes de chamar o projeto de fechado.

**Executar**
- focar em:
  - `learning.ts`
  - `memory/*`
  - `contextLoader.ts`
  - `openai/client.ts`
  - `telegram-ingestion/*`

**Critério de aceite**
- warnings caem substancialmente
- tipagem melhora nas áreas críticas

**Ganho esperado**
- +1 a +3 pontos

## Sequência Recomendada por PR Final

1. ~~PR-F1: Expandir suíte oficial de testes~~ (parcial - testes existentes)
2. ~~PR-F2: Ajustar thresholds e coverage real~~ (vitest.config.ts atualizado)
3. ~~PR-F3: Integrar chunking ao pipeline~~ (pipeline.ts criado)
4. ~~PR-F4: Fechar curadoria ponta a ponta~~ ✅ (fluxo de aprovação corrigido)
5. PR-F5: Persistir analytics
6. PR-F6: Completar eventos operacionais
7. PR-F7: Integrar learning loop
8. PR-F8: Corrigir Dockerfile
9. PR-F9: Revisar health/readiness
10. PR-F10: Reduzir warnings críticos restantes
11. PR-F11: Reauditoria final e atualização documental

## Meta de Nota por Marco

| Marco | Nota alvo |
|------|-----------|
| Após Bloco 1 | 78+ |
| Após Bloco 2 | 82+ |
| Após Bloco 3 | 85+ |
| Após Bloco 4 | 86-90 |

## Critério Final de Fechamento

O projeto só deve ser reclassificado como **produção assistida real** quando:

- a suíte oficial representar o sistema de forma honesta
- o pipeline de conhecimento estiver fechado de ponta a ponta
- analytics estiver persistido
- health/readiness refletirem dependências reais
- a imagem de execução for reproduzível
- a documentação final estiver coerente com o código

## O Que Não Deve Entrar Agora

- Qdrant
- A/B testing
- pattern detection avançado
- multi-tenant
- API pública
- webhooks enterprise
- novos canais não críticos

## Caminho Crítico Resumido

Se houver pouco tempo, o menor caminho para subir de 74 para 85+ é:

1. expandir testes
2. integrar chunking de verdade
3. persistir analytics
4. revisar health/readiness
5. corrigir Dockerfile

Esse é o conjunto mínimo que fecha a lacuna entre “estrutura boa” e “operação confiável”.

*Plano final gerado em 25/03/2026*
