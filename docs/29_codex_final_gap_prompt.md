# 29 - Prompt Final para Fechamento dos Gaps

## Objetivo

Este prompt instrui o Codex a atacar somente os gaps restantes até elevar o projeto de **74/100** para **85+/100**, com foco em fechamento técnico real e não em expansão de escopo.

## Prompt

```text
Quero que você atue como o engenheiro responsável pelo fechamento final dos gaps restantes deste projeto, com o objetivo explícito de elevar a nota técnica atual de 74/100 para 85+/100 de forma honesta e comprovável.

Antes de alterar qualquer coisa, leia cuidadosamente estes documentos e use-os como fonte principal de verdade:

- docs/28_final_gap_closure_plan.md
- docs/27_post_implementation_delivery_audit.md
- docs/26_production_assistance_checklist.md
- docs/25_codex_operational_prompt.md
- docs/24_prioritized_correction_plan.md
- docs/23_delivery_assessment_report.md
- docs/22_implementation_backlog.md
- docs/20_execution_master_plan.md
- docs/13_roadmap-phases.md

Seu trabalho agora NÃO é abrir novas frentes. Seu trabalho é fechar apenas os gaps restantes com impacto real na nota e na prontidão operacional.

## Escopo permitido

Você deve trabalhar somente nestes temas:

1. expandir a suíte oficial de testes
2. ajustar coverage para refletir a suíte real
3. integrar chunking ao pipeline real de ingestão/publicação
4. fechar curadoria ponta a ponta
5. persistir analytics
6. completar eventos operacionais no runtime
7. integrar learning loop ao fluxo real
8. corrigir Dockerfile para build reproduzível
9. revisar health/readiness com dependências reais
10. reduzir warnings críticos de lint nos módulos centrais
11. reauditar e atualizar a documentação final

## Escopo proibido por enquanto

Não trabalhar agora em:

- Qdrant
- A/B testing
- pattern detection avançado
- multi-tenant
- API pública
- webhooks enterprise
- novos canais não críticos
- features extras fora da rota de fechamento

## Ordem obrigatória de execução

Siga exatamente esta ordem:

1. PR-F1: Expandir suíte oficial de testes
2. PR-F2: Ajustar thresholds e coverage real
3. PR-F3: Integrar chunking ao pipeline
4. PR-F4: Fechar curadoria ponta a ponta
5. PR-F5: Persistir analytics
6. PR-F6: Completar eventos operacionais
7. PR-F7: Integrar learning loop
8. PR-F8: Corrigir Dockerfile
9. PR-F9: Revisar health/readiness
10. PR-F10: Reduzir warnings críticos restantes
11. PR-F11: Reauditoria final e atualização documental

## Regras obrigatórias

1. Trabalhe em um único PR lógico por vez.
2. Antes de implementar, valide o estado real do código no item atual.
3. Não declare concluído o que estiver apenas parcialmente presente.
4. Ao final de cada PR lógico:
   - implemente
   - valide
   - atualize `/docs`
   - explique o que mudou e o que falta
5. Se houver divergência entre checklist e código, corrija a documentação com honestidade.
6. Não use a existência de arquivos como prova suficiente; valide integração real no fluxo principal.
7. Priorize mudanças pequenas, cumulativas e seguras.
8. Persista até concluir a rota crítica inteira.

## Critério de conclusão por PR lógico

Cada PR lógico só fecha quando:

- o código necessário está implementado
- a integração real foi validada
- os comandos relevantes passaram
- a documentação foi atualizada
- o projeto ficou materialmente mais próximo de 85+

## Comandos de validação

Use conforme o caso:

- `npm test`
- `npm run test:coverage`
- `npm run lint`
- `npm run build`
- validações adicionais de Docker ou fluxo de dados quando aplicável

## Metas por bloco

### Meta 1
- suíte oficial mais honesta e representativa
- nota alvo: 78+

### Meta 2
- pipeline de conhecimento fechado de ponta a ponta
- nota alvo: 82+

### Meta 3
- analytics persistido e operacional
- nota alvo: 85+

### Meta 4
- readiness de produção assistida real
- nota alvo final: 85-90

## Formato de trabalho esperado

Em cada etapa:

1. diga qual PR-F você está executando
2. explique rapidamente o gap que ele fecha
3. inspecione os arquivos necessários
4. implemente a mudança
5. valide tecnicamente
6. atualize a documentação relevante
7. informe o que foi concluído e qual é o próximo PR-F

## Critério final de sucesso

Seu trabalho só termina quando:

- a suíte oficial de testes representar melhor o sistema
- o chunking estiver realmente integrado ao pipeline
- a curadoria estiver fechada ponta a ponta
- analytics estiver persistido e útil
- health/readiness forem confiáveis
- Docker buildar de forma reproduzível
- os warnings críticos tiverem sido reduzidos
- a documentação final estiver coerente com o estado real

## Instrução final

Comece agora pelo PR-F1.

Não me entregue um plano novo.
Execute as correções.
Mantenha a documentação viva.
Trabalhe até fechar os gaps restantes com honestidade técnica.
```

*Prompt final gerado em 25/03/2026*
