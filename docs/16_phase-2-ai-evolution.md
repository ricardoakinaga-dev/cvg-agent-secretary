# 16 - Fase 2: Evolução de IA

## Status

⚠️ Parcial

## Objetivo

Consolidar a camada de IA com resiliência, governança e eficiência de custo.

## O que já foi entregue

- Abstração de provider
- OpenAI provider
- OpenRouter provider
- `AIRouter` com fallback
- Integração do router ao runtime

## O que ainda falta

- Cache de embeddings
- Curadoria operacional do conhecimento
- Critério de adoção de `Qdrant`
- Testes específicos de fallback e custo

## Entregáveis revisados

- [x] Multi-provider funcional
- [x] Fallback automático
- [x] Configuração por ambiente
- [ ] Cache de embeddings
- [ ] Curadoria de conhecimento
- [ ] Vector store dedicado, se necessário

## Decisões de escopo

1. OpenRouter substitui Anthropic como backup documentado
2. `Qdrant` deixa de ser obrigação imediata
3. O fechamento desta fase depende mais de governança e custo do que de adicionar novos providers

## Critérios de conclusão da fase

1. Cache de embeddings em operação
2. Fluxo mínimo de curadoria definido
3. Métricas de uso e fallback por provider

*Documento revisado em 25/03/2026*
