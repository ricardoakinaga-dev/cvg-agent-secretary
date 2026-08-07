# 67 - Inventario e Mapa de Fluxo de Dados

## Status e aprovacao

Este documento e o inventario tecnico inicial do item PRV-001. Ele **nao aprova base legal, prazo de retencao nem compartilhamento com fornecedores**. Esses campos devem ser preenchidos e assinados pelo Encarregado/DPO e pelo owner do processo antes de usar dados reais.

| Campo de governanca | Estado |
|---|---|
| Owner tecnico | A designar |
| Owner do processo hospitalar | A designar |
| Encarregado/DPO | A designar |
| Versao aprovada | Pendente |
| Data de aprovacao | Pendente |
| Proxima revisao | Pendente |

## Classificacao adotada

| Classe | Descricao | Exemplos neste sistema |
|---|---|---|
| Pessoal direto | Identifica tutor ou operador | nome, telefone, e-mail, CPF, endereco, identificadores Chatwoot |
| Pessoal indireto | Pode identificar quando combinado | conversation ID, contact ID, correlation ID, horarios e canal |
| Clinico/veterinario | Conteudo assistencial do animal associado ao tutor | sintomas relatados, condicoes, vacinas, motivo da consulta |
| Credencial/seguranca | Permite acesso ou valida origem | JWT, API keys, assinatura de webhook, IP |
| Institucional | Conteudo aprovado sem dados de titular | FAQ, politica, procedimento e horario |
| Operacional | Necessario para executar e comprovar o servico | status de fila, handoff, agendamento, auditoria |

## Inventario por origem e destino

| Origem | Dados/campos relevantes | Finalidade tecnica | Destinos/operadores | Retencao | Base/finalidade aprovada | Owner |
|---|---|---|---|---|---|---|
| Webhook Chatwoot | account/inbox/conversation/contact/message IDs, nome e conteudo | receber solicitacao e responder | Redis, PostgreSQL, runtime, Chatwoot | Pendente na politica 68 | A validar pelo Encarregado | A designar |
| API administrativa | `sub`, role, operacao, correlation ID e IP | autenticar, autorizar e auditar | memoria de processo, logs redigidos, PostgreSQL/auditoria | Pendente | A validar | A designar |
| Cadastro do tutor | nome, telefone, e-mail, WhatsApp, endereco, CPF, notas | identificar tutor e manter contexto autorizado | PostgreSQL `contacts`; campos protegidos com AES-256-GCM e indices cegos HMAC | Pendente | A validar | A designar |
| Cadastro do animal | nome, especie, raca, nascimento, peso, microchip, vacinas e condicoes | atendimento e agenda veterinaria | PostgreSQL `pets` e `customer_memories` | Pendente | A validar | A designar |
| Conversa | conteudo, remetente, resumo, fatos e sentimento | continuidade do atendimento e handoff | PostgreSQL `messages`, `conversation_summaries`, Redis temporario | Pendente | A validar | A designar |
| Agendamento | tutor/animal, motivo, servico, profissional, slot e status | reservar e comprovar atendimento | PostgreSQL `appointments`, `followup_tasks` | Pendente | A validar | A designar |
| Handoff/notificacao | motivo, resumo, perguntas e setor | encaminhamento humano seguro | PostgreSQL `handoffs`, `sector_notifications` | Pendente | A validar | A designar |
| Execucao de tools | nome da tool, entrada, saida, erro e duracao | confiabilidade, investigacao e idempotencia | PostgreSQL `tool_executions` | Pendente | A validar | A designar |
| Feedback/analytics | consulta, resposta, qualidade, provedor e metricas | avaliar qualidade e regressao | PostgreSQL `response_feedback`, `analytics_events` | Pendente | A validar | A designar |
| Telegram/curadoria | conteudo bruto, IDs Telegram e aprovadores | curar conhecimento institucional | PostgreSQL, Qdrant quando publicado | Pendente | A validar | A designar |
| Provedor de IA | contexto minimizado, mensagem e resultado de tool permitido | gerar resposta assistiva | OpenAI ou OpenRouter, conforme roteamento | Conforme contrato; pendente | A validar, incluindo transferencia | A designar |
| Logs | metadados tecnicos redigidos, correlation ID, codigos de erro | operacao e incidente | backend de logs a definir | Pendente | A validar | A designar |
| Auditoria | ator verificado, tipo, hash de escopo, contagens e comprovante | governanca e prova de operacao | PostgreSQL `audit_events` | Pendente, preservacao especial | A validar | A designar |

## Inventario por store

### PostgreSQL

- Titular e animal: `contacts`, `pets`, `customer_memories`.
- Conversa: `conversations`, `messages`, `conversation_summaries`.
- Operacao: `handoffs`, `sector_notifications`, `appointments`, `followup_tasks`.
- Evidencia/qualidade: `tool_executions`, `response_feedback`, `analytics_events`, `audit_logs`, `audit_events`.
- Conhecimento: `knowledge_documents`, `knowledge_chunks`, `telegram_ingestions`, `operational_rules`.
- Controle: todas as consultas de privacidade usam `tenant_id` e identificador UUID do contato.
- Contatos: PII direta fica em `pii_encrypted`; colunas de consulta armazenam HMAC tenant-bound e `name` conserva apenas pseudonimo. A key ring e a chave de lookup permanecem fora do banco.

### Redis

- Fila de webhook pendente, em processamento, atrasada e DLQ.
- Estado e historico temporario da conversa.
- Chaves de deduplicacao, lease e correlation ID.
- Pode conter conteudo de mensagem; por isso nao pode ser declarado "sem dado pessoal" sem uma nova verificacao do DTO real.

### Qdrant

- Finalidade pretendida: vetores de conhecimento institucional publicado.
- Risco: uma ingestao indevida pode inserir nome, telefone ou texto clinico no payload/embedding.
- O adapter `AttestedNoPersonalDataAdapter` so pode ser usado depois de uma atestacao versionada de que a colecao nao contem dados de titular; caso contrario deve existir adapter real de busca e remocao por tenant/titular.

### Logs

- O perfil esperado registra somente metadados redigidos.
- Uma atestacao de ausencia de PII exige amostragem e teste de redacao do backend real, nao apenas do logger local.
- Se o backend permitir localizar dados de titular, deve ser conectado por `DelegatedPrivacyStoreAdapter`; se for imutavel por obrigacao, registrar restricao e prazo no comprovante.

## Mapa de fluxo

```text
WhatsApp -> Chatwoot -> webhook assinado -> DTO minimo -> Redis/fila
                                               |
                                               v
                                      runtime do agente
                                      /       |       \
                              PostgreSQL   IA/RAG    tools
                                  |          |         |
                                  |       provedor   agenda/handoff
                                  v
                           resposta -> Chatwoot -> WhatsApp

Operador autenticado -> API de privacidade -> preflight em todos os stores
                                            -> exportar/anonimizar/eliminar
                                            -> comprovante em audit_events
```

## Regras de minimizacao

1. Identificadores de tenant e contato nunca sao aceitos do corpo como fonte de autoridade; o tenant vem da configuracao/identidade verificada.
2. Recibos guardam hashes de escopo e contagens, nunca o UUID bruto do titular ou o conteudo exportado.
3. Exportacoes retornam dados ao solicitante autorizado, mas nao os persistem no evento de auditoria.
4. Logs de falha registram apenas codigo, operacao e stores concluidos.
5. Um store somente pode ser tratado como nao aplicavel mediante atestacao de inventario versionada.

## Pendencias para aprovar PRV-001

- nomear os owners e o Encarregado/DPO;
- confirmar finalidade e base legal por linha;
- verificar contrato, regiao, suboperadores e retencao de OpenAI/OpenRouter/Chatwoot;
- inspecionar payloads reais de Redis, Qdrant e backend de logs;
- decidir se identificadores Chatwoot fazem parte da exportacao ao titular;
- classificar obrigacoes de conservacao de agenda, prontuario, auditoria e incidente.

## Implementacao conectada

- PostgreSQL e Redis possuem adapters reais tenant-aware para exportacao e mutacao.
- Qdrant e logs exigem atestacao versionada de ausencia de PII antes da ativacao; sem ela o startup/configuracao de privacidade falha.
- A API esta montada em `/api/privacy` somente com `PRIVACY_ENABLED=true`, policy, checkpoints e atestacoes validas.
- Permissoes dedicadas `privacy:read` e `privacy:delete` pertencem somente ao papel `admin`.

O inventario continua pendente de aprovacao humana; a existencia do controle tecnico nao define base legal ou finalidade.
