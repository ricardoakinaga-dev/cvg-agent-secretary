# 06 - Dados e Estratégia RAG

## Objetivo

Registrar a estratégia de dados e RAG já praticada pelo projeto e os próximos passos para maturidade.

## Estado Atual

### Implementado

- Retrieval com fallback para PostgreSQL
- Geração de embeddings
- Estrutura para expansão de vector store
- Ingestion de conteúdo via Telegram
- Enhanced RAG em camada de inteligência

### Pendente

- Cache de embeddings
- Curadoria operacional
- Métricas de qualidade de retrieval
- `Qdrant`, se passar a ser necessário

## Decisão de Roadmap

No curto prazo, o ganho mais claro está em cache e curadoria. `Qdrant` permanece como opção futura, não como bloqueador de implementação.

## Leitura operacional

O pipeline de Telegram já participa da estratégia de conhecimento e não deve mais ser descrito como uma promessa isolada de fase futura.

*Documento revisado em 25/03/2026*
