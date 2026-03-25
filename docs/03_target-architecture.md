# 03 - Arquitetura Alvo

## Objetivo

Descrever a arquitetura alvo prática do projeto, considerando o que já existe no código e o que ainda está em evolução.

## Visão de Alto Nível

```
API Layer (Express)
    ->
Runtime / Orchestration
    ->
Intent / Knowledge / Memory / Handoff / Security
    ->
AI Layer (OpenAI + OpenRouter via AIRouter)
    ->
Channels (Chatwoot, WhatsApp/Evolution, Telegram ingestion)
    ->
Data Layer (PostgreSQL + Redis)
```

## Decisões Arquiteturais Atuais

| Tema | Decisão Atual |
|------|---------------|
| Provider primário | OpenAI |
| Provider alternativo | OpenRouter |
| Persistência principal | PostgreSQL |
| Cache e estado | Redis |
| Vector store | PostgreSQL fallback hoje, `Qdrant` opcional no futuro |
| Omnicanal | Camada de normalização dedicada |

## Ajustes Importantes

1. Anthropic direto não é mais o backup documentado do sistema
2. Telegram ingestion não deve mais ser tratado como item exclusivo de "Fase 5"
3. A arquitetura já inclui módulos de `ai`, `channels`, `validation` e `intelligence`

## Fonte complementar

Para direcionamento de implementação, combinar este documento com:

- `04_ai-multi-provider-strategy.md`
- `13_roadmap-phases.md`
- `20_execution_master_plan.md`

*Documento revisado em 25/03/2026*
