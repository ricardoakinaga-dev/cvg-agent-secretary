# 04 - Estratégia Multi-Provider de IA

## Objetivo

Documentar a estratégia real de múltiplos provedores de IA do CVG Agent Secretary, alinhada ao código implementado e ao backlog ainda pendente.

## Estado Atual

### Implementado

- OpenAI como provider principal padrão
- OpenRouter como provider alternativo/fallback
- `AIRouter` para seleção e fallback
- Configuração por ambiente com `AI_PROVIDER`

### Pendente

- Cache de embeddings
- Curadoria operacional do conhecimento
- Avaliação de `Qdrant`
- Monitoramento analítico mais rico por provider

## Providers

| Provider | Papel | Status |
|----------|-------|--------|
| OpenAI | Primário padrão | ✅ Ativo |
| OpenRouter | Alternativo/fallback | ✅ Ativo |
| Anthropic direto | Possível evolução futura | ⏳ Fora do escopo atual |

## Fluxo Atual de Fallback

```
1. Tentar provider primário
   ├── sucesso -> retornar resposta
   └── falha -> tentar provider secundário
       ├── sucesso -> retornar resposta com log de fallback
       └── falha -> retornar resposta de fallback da aplicação
```

## Configuração

```bash
AI_PROVIDER=auto
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
```

### Regras de seleção

| Configuração | Comportamento |
|-------------|---------------|
| `AI_PROVIDER=auto` | OpenAI primário, OpenRouter fallback |
| `AI_PROVIDER=openai` | OpenAI primário |
| `AI_PROVIDER=openrouter` | OpenRouter primário, OpenAI fallback |

## Arquivos Relevantes

- `src/modules/ai/types.ts`
- `src/modules/ai/openai.ts`
- `src/modules/ai/openrouter.ts`
- `src/modules/ai/router.ts`
- `src/modules/runtime/agentRuntime.ts`
- `src/config/index.ts`

## Decisões de Roadmap

1. OpenRouter substitui Anthropic como backup documentado
2. O foco da Phase 2 deixa de ser "trocar provider" e passa a ser "maturar governança e custo"
3. `Qdrant` é opcional no curto prazo e deve ser dirigido por necessidade real

## Critérios para concluir a frente de IA

- Router multi-provider estável
- Testes cobrindo fallback
- Cache de embeddings ativo
- Curadoria mínima definida

## Próximos Passos

1. Instrumentar métricas por provider
2. Implementar cache de embeddings
3. Formalizar fluxo de curadoria
4. Reavaliar `Qdrant` após métricas reais de uso

*Documento alinhado ao código em 25/03/2026*
