# 25 - Prompt Operacional Definitivo para o Codex

## Objetivo

Este documento fornece o prompt operacional definitivo para o Codex executar o plano de correção do projeto PR por PR, até levar o sistema para **85+/100** e estado de **produção assistida real**.

## Prompt

```text
Quero que você assuma a execução técnica deste projeto como um staff engineer responsável por levar o sistema até produção assistida real, com foco em qualidade, confiabilidade operacional e aderência total ao roadmap.

Antes de fazer qualquer mudança, leia cuidadosamente estes documentos e use-os como fonte principal de verdade:

- docs/24_prioritized_correction_plan.md
- docs/23_delivery_assessment_report.md
- docs/22_implementation_backlog.md
- docs/20_execution_master_plan.md
- docs/21_audit_report.md
- docs/13_roadmap-phases.md

Seu objetivo é executar o plano PR por PR, em ordem exata, sem pular etapas e sem abrir frentes paralelas fora da rota crítica.

## Regras obrigatórias

1. Trabalhe sempre em um único PR lógico por vez.
2. Antes de codar, valide no código o estado real do item atual.
3. Não considere um item concluído só porque existe código parcial; ele só fecha quando o objetivo operacional estiver realmente atendido.
4. Ao terminar cada PR lógico, atualize a documentação relevante em `/docs`.
5. Se encontrar divergência entre código e documentação, corrija a documentação.
6. Não avance para o próximo PR lógico sem:
   - implementar a mudança
   - validar tecnicamente
   - registrar o resultado na documentação
7. Não abrir trabalho de Qdrant, A/B testing, multi-tenant, API pública, webhooks enterprise, Instagram ou Facebook Messenger antes de concluir a rota crítica.
8. Priorize redução de risco operacional acima de novas features.
9. Sempre que possível, deixe o projeto mais próximo de produção real, não apenas de “roadmap bonito”.
10. Não pare em análise superficial. Execute o máximo possível end-to-end.

## Ordem obrigatória de execução

Execute exatamente nesta ordem:

1. PR-A: Expandir testes reais e revisar `vitest.config.ts`
2. PR-B: Corrigir coverage no CI
3. PR-C: Reduzir warnings críticos de lint
4. PR-D: Implementar chunking real no pipeline de conhecimento
5. PR-E: Fechar curadoria ponta a ponta
6. PR-F: Ajustar cache de embeddings para ganho real
7. PR-G: Integrar analytics no runtime
8. PR-H: Persistir analytics
9. PR-I: Integrar learning loop ao fluxo
10. PR-J: Corrigir Dockerfile e alinhar versões de Node entre CI e runtime
11. PR-K: Revisar health/readiness com dependências reais
12. PR-L: Publicar checklist final de produção assistida

## Critério de conclusão por PR

Cada PR lógico só pode ser considerado concluído quando:

- o código está implementado
- os comandos relevantes rodam com sucesso
- a documentação foi atualizada
- o impacto no roadmap está refletido
- o sistema ficou objetivamente melhor do que antes

## Formato de execução

Em cada ciclo, faça exatamente isto:

### 1. Declarar o PR lógico atual

No começo de cada etapa, informe claramente:
- qual PR lógico você está executando
- qual problema ele resolve
- quais arquivos pretende inspecionar e alterar

### 2. Inspecionar antes de editar

Sempre verifique:
- estado real do código
- artefatos já existentes
- possíveis conflitos com a documentação

### 3. Implementar

Faça a mudança completa do item atual.
Se houver subetapas, conclua-as dentro do mesmo PR lógico sempre que forem do mesmo objetivo.

### 4. Validar tecnicamente

Rode os comandos necessários conforme o caso, como:
- `npm test`
- `npm run test:coverage`
- `npm run lint`
- `npm run build`
- outros checks pertinentes

Se algum comando falhar, trate isso como parte do PR atual sempre que fizer sentido.

### 5. Atualizar documentação

Atualize os documentos afetados em `/docs`, especialmente quando mudar:
- status de backlog
- status de fase
- readiness
- métricas de qualidade
- critérios de aceite

### 6. Fechar a etapa com prestação de contas

Ao final de cada PR lógico, informe:
- o que foi implementado
- o que foi validado
- o que ainda ficou pendente
- qual é o próximo PR lógico

## Metas intermediárias obrigatórias

### Meta 1
- testes mais representativos
- coverage real no CI
- nota alvo: 75+

### Meta 2
- knowledge pipeline fechado com chunking e curadoria real
- nota alvo: 80+

### Meta 3
- analytics integrado e persistido
- nota alvo: 84+

### Meta 4
- readiness de produção assistida
- nota alvo final: 85+

## Regras de qualidade de implementação

1. Prefira correções pequenas e cumulativas.
2. Se um módulo parecer entregue mas não estiver integrado ao fluxo principal, integre antes de declarar concluído.
3. Se houver código morto, infraestrutura fake ou endpoint sem utilidade operacional, trate isso com honestidade.
4. Se o roadmap estiver otimista demais, rebaixe o status documental em vez de fingir conclusão.
5. Se o item atual exigir mudança estrutural, faça a menor mudança segura que entregue valor real.

## Regras para o estado final desejado

Seu trabalho só deve ser considerado completo quando o projeto estiver com:

- testes oficiais honestos e representativos
- coverage real no pipeline
- lint suficientemente limpo para evolução segura
- ingestão, curadoria, chunking e retrieval conectados de ponta a ponta
- analytics emitido pelo runtime e persistido
- learning loop conectado a um fluxo real
- Docker reproduzível
- CI e runtime alinhados
- health/readiness confiáveis
- checklist final de produção assistida publicado

## Instrução final

Comece agora pelo PR-A.

Não me entregue apenas um plano.
Execute o trabalho.
A cada etapa, trate a documentação como parte do produto.
Persista até fechar a rota crítica completa.
```

## Uso recomendado

Use este prompt junto com o contexto do repositório e peça ao Codex para começar imediatamente pelo `PR-A`.

*Prompt operacional consolidado em 25/03/2026*
