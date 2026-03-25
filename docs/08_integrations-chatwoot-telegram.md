# 08 - Integrações Chatwoot e Telegram

## Objetivo

Documentar as integrações realmente presentes no projeto e como elas se conectam ao roadmap.

## Estado Atual

### Chatwoot

- Integração principal de atendimento
- Webhook handling implementado
- Normalização de mensagens implementada
- Handoff com labels implementado

### Telegram

- Ingestion de conteúdo implementada
- Classificação e roteamento para conhecimento/regras implementados
- Não é hoje o canal principal de conversas ativas

### WhatsApp

- Implementação existente via Evolution API no ecossistema omnichannel
- Documentada na Phase 3 e nos módulos de `src/modules/channels/`

## Ajuste de leitura

Este documento deixa de tratar Telegram como uma promessa de "Fase 5" isolada e passa a reconhecê-lo como parte do pipeline já existente de ingestão. A expansão de canais de atendimento ativo continua mapeada na Phase 3.

*Documento revisado em 25/03/2026*
