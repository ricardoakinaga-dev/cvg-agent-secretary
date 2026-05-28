# 40 - Relatorio de Fluxo de Funcionamento

## Objetivo

Registrar o estado atual do fluxo operacional do `cvg-agent-secretary`, com foco em:

- caminho WhatsApp, EvolutionAPI, Chatwoot e agent-secretary;
- funcionamento interno da secretary;
- uso de Qdrant/RAG;
- ferramentas disponiveis;
- construcao da base de conhecimento;
- guardrails implementados e efetivamente aplicados.

## Resumo Executivo

O fluxo esperado pelo usuario e:

```text
Tutor -> WhatsApp -> EvolutionAPI -> Chatwoot -> agent-secretary -> Chatwoot -> EvolutionAPI -> WhatsApp
```

Pelo codigo atual, esse fluxo esta parcialmente correto. O `agent-secretary` opera principalmente como consumidor de webhooks do Chatwoot e respondedor via API do Chatwoot. A integracao direta com EvolutionAPI existe como modulo separado, mas nao esta conectada ao runtime principal da conversa.

Tambem foi verificado que a secretary nao consulta Qdrant atualmente. O RAG operacional usa PostgreSQL full-text search sobre `knowledge_chunks`. Existe abstracao para vector store futura, mas nao ha adapter Qdrant implementado no codigo atual.

## Fluxo Real Implementado

### Fluxo operacional principal

1. Tutor envia mensagem pelo WhatsApp.
2. EvolutionAPI entrega a mensagem ao Chatwoot, fora deste codigo.
3. Chatwoot envia webhook para:

```text
POST /webhooks/chatwoot
```

4. O endpoint em `src/app.ts` recebe o evento.
5. O runtime em `src/modules/runtime/agentRuntime.ts` processa a mensagem:
   - valida se o evento e relevante;
   - normaliza a mensagem;
   - deduplica com Redis;
   - carrega contexto da conversa;
   - carrega memoria do tutor e pets;
   - busca conhecimento institucional;
   - chama o provedor de IA;
   - envia a resposta para o Chatwoot.
6. A resposta e enviada para o Chatwoot via `src/modules/chatwoot/client.ts`.
7. Chatwoot/EvolutionAPI fazem a entrega final ao WhatsApp.

### Estado da EvolutionAPI no codigo

Existe provider direto para EvolutionAPI em:

```text
src/modules/channels/whatsapp.ts
```

Ele suporta:

- `sendMessage`
- `sendMediaMessage`
- `healthCheck`
- `getInstanceStatus`

Variaveis esperadas:

```text
EVOLUTION_API_URL
EVOLUTION_API_KEY
WHATSAPP_INSTANCE
```

Porem, esse provider nao esta ligado ao fluxo principal de `src/modules/runtime/agentRuntime.ts`. Portanto, hoje a secretary responde via Chatwoot, nao diretamente via EvolutionAPI.

## Funcionamento Interno da Secretary

A secretary executa o seguinte fluxo interno ao receber uma mensagem:

1. Normaliza o payload do Chatwoot.
2. Ignora mensagens irrelevantes ou que nao sejam incoming.
3. Calcula hash da mensagem e consulta Redis para evitar duplicidade.
4. Carrega ou cria contexto de conversa.
5. Verifica se a conversa deve ser processada.
6. Adiciona a mensagem ao contexto.
7. Carrega contato, memorias e pets.
8. Busca conhecimento em `knowledgeRetrievalService`.
9. Monta contexto para a IA com:
   - nome do contato;
   - historico da conversa;
   - memorias;
   - pets;
   - trechos da base de conhecimento.
10. Chama `aiRouter.generate`.
11. Envia resposta para o Chatwoot.
12. Registra metricas e eventos como `message_received`, `response_sent`, `fallback_triggered` e `handoff_triggered`.

## Qdrant e RAG

### Qdrant

A secretary nao consulta Qdrant atualmente.

Nao foi encontrado adapter Qdrant implementado nem dependencia Qdrant no projeto. O codigo possui comentarios e abstracoes que permitem uma integracao futura com Qdrant, pgvector, Pinecone ou outro vector store, mas isso ainda nao esta ligado.

### RAG atual

O RAG atual usa PostgreSQL full-text search como fallback principal.

Arquivos relevantes:

```text
src/modules/knowledge/retrieval.ts
src/modules/knowledge/repository.ts
database/schema.sql
```

O fluxo de busca atual:

1. `KnowledgeRetrievalService` inicializa com `PostgresFullTextStore`.
2. A busca consulta `knowledge_chunks`.
3. A query usa:

```sql
to_tsvector('portuguese', content) @@ plainto_tsquery('portuguese', $1)
```

4. Os chunks encontrados sao injetados no prompt da IA como `Base de Conhecimento`.

### Embeddings

O sistema gera embeddings com OpenAI ao criar chunks, quando possivel. O schema possui:

```sql
embedding VECTOR(1536)
```

Mas a busca operacional atual nao usa Qdrant e nao usa similaridade vetorial de forma efetiva. A busca em producao do fluxo atual e textual via PostgreSQL.

## Ferramentas Disponiveis

Existem ferramentas implementadas em TypeScript, mas o fluxo principal nao usa function calling/tool calling real do modelo. Ou seja, sao ferramentas internas/fundacionais, nao ferramentas executadas dinamicamente pelo LLM durante a conversa.

### Ferramentas de conhecimento

Arquivo:

```text
src/modules/knowledge/tools.ts
```

Ferramentas:

- `search_knowledge`
- `get_knowledge_by_category`

### Ferramentas de memoria

Arquivo:

```text
src/modules/memory/tools.ts
```

Ferramentas:

- `find_contact`
- `create_or_update_contact`
- `find_pet`
- `create_or_update_pet`
- `save_memory`
- `list_memories`
- `log_summary`

### Ferramentas de handoff e operacao

Arquivo:

```text
src/modules/handoff/tools.ts
```

Ferramentas:

- `create_handoff`
- `notify_sector`
- `create_followup_task`
- `get_operational_rules`

### Ferramentas de ingestao de conhecimento

Arquivo:

```text
src/modules/telegram-ingestion/tools.ts
```

Ferramentas:

- `ingest_telegram_content`
- `approve_content`
- `reject_content`
- `preview_classification`
- `list_pending_content`

## Base de Conhecimento

### Estrutura de dados

A base de conhecimento usa as tabelas:

```text
knowledge_documents
knowledge_chunks
telegram_ingestions
operational_rules
```

Definidas em:

```text
database/schema.sql
```

### Fluxo esperado para construir conhecimento

1. Criar documento em `knowledge_documents`.
2. Revisar/aprovar o documento.
3. Publicar o documento.
4. Ao publicar, o sistema chama `createChunksForDocument`.
5. O documento e dividido em chunks.
6. O sistema tenta gerar embeddings.
7. Os chunks sao persistidos em `knowledge_chunks`.
8. As conversas passam a recuperar esses chunks.

### Caminhos de implementacao

Arquivos:

```text
src/modules/knowledge/repository.ts
src/modules/knowledge/pipeline.ts
src/modules/knowledge/chunking.ts
src/modules/telegram-ingestion/service.ts
src/modules/telegram-ingestion/tools.ts
```

### Observacao operacional

Nao foram encontrados endpoints HTTP administrativos para cadastrar, revisar e publicar conhecimento. Portanto, hoje a construcao da base de conhecimento depende de uma destas abordagens:

1. script interno chamando `knowledgeRepository.createDocument()` e `publishDocument()`;
2. uso programatico das ferramentas de `telegram-ingestion`;
3. implementacao de endpoints/admin UI;
4. insercao direta no banco, desde que depois se garanta publicacao e geracao de chunks.

Sem chunks publicados em `knowledge_chunks`, a secretary nao tera material util para recuperar durante a conversa.

## Guardrails

### Guardrails no prompt

O prompt principal em `src/modules/openai/client.ts` instrui a secretary a:

- nunca fornecer diagnostico medico;
- nunca prescrever medicamentos;
- nunca fazer prognosticos;
- nao inventar informacoes;
- sugerir agendamento quando houver duvidas de saude;
- orientar atendimento urgente em emergencias;
- responder em portugues brasileiro;
- manter tom cordial, profissional e acolhedor.

Esses guardrails estao efetivamente presentes no fluxo, porque o prompt e enviado ao provedor de IA.

### Guardrails programaticos

Existe modulo em:

```text
src/modules/security/guardrails.ts
```

Ele implementa:

- deteccao de jailbreak/prompt injection;
- deteccao de CPF, CNPJ e cartao;
- deteccao de conteudo clinico;
- checagem de resposta contra diagnostico, prescricao e prognostico;
- fallback por falta de conhecimento;
- fallback por baixa confianca;
- handoff quando necessario;
- resposta clinica segura.

### Limitacao atual dos guardrails

O modulo programatico de guardrails nao esta conectado ao runtime principal.

Nao foi encontrado uso de:

```text
checkGuardrails
checkResponseGuardrails
createSafeClinicalResponse
```

em `src/modules/runtime/agentRuntime.ts`.

Portanto, na conversa real, os guardrails efetivos dependem principalmente do prompt. Os guardrails programaticos existem e possuem testes, mas precisam ser aplicados antes e depois da chamada de IA para valerem em producao.

## Lacunas Principais

1. EvolutionAPI existe como provider direto, mas nao esta conectada ao runtime principal.
2. Qdrant nao esta implementado nem consultado.
3. Busca RAG atual e PostgreSQL full-text, nao vetorial.
4. Ferramentas existem em codigo, mas nao sao usadas como tool calling real pelo LLM.
5. Base de conhecimento tem pipeline de documento -> publicacao -> chunks, mas falta superficie administrativa HTTP/UI.
6. Guardrails programaticos existem, mas nao estao aplicados no fluxo da conversa.

## Conclusao

O fluxo principal atual e confiavel como:

```text
Chatwoot webhook -> agent-secretary -> Chatwoot API
```

No desenho completo com WhatsApp, a EvolutionAPI precisa estar conectada ao Chatwoot fora deste servico. A secretary nao fala diretamente com a EvolutionAPI no fluxo principal.

Para chegar ao funcionamento ideal, os proximos fechamentos tecnicos mais importantes sao:

1. decidir se a EvolutionAPI continuara apenas via Chatwoot ou tambem sera canal direto no runtime;
2. conectar guardrails programaticos no `agentRuntime`;
3. criar uma superficie administrativa para base de conhecimento;
4. decidir entre manter PostgreSQL full-text, ativar pgvector ou implementar Qdrant;
5. transformar as ferramentas existentes em tool calling real, se o objetivo for um agente mais autonomo.

*Relatorio gerado em 2026-05-26.*
