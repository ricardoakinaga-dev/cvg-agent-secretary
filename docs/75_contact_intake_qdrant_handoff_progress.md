# 75 - Progresso: Intake, Qdrant e Handoff

## Objetivo

Implementar o fluxo de recepcao solicitado para contatos do Chatwoot:

1. identificar se o contato e tutor, cliente, colaborador, fornecedor ou outro;
2. registrar o motivo do contato;
3. coletar somente os dados adicionais necessarios;
4. consultar os chunks institucionais publicados no Qdrant;
5. responder apenas com evidencia suficiente ou transferir para atendimento humano.

## Fluxo implementado

```text
mensagem Chatwoot
  -> urgencia/pedido humano (handoff imediato)
  -> identificacao de perfil e motivo
  -> coleta minima por perfil
  -> persistencia PostgreSQL + Redis
  -> busca publica tenant-aware no Qdrant
  -> resposta com guardrails
  -> baixa evidencia/erro/tentativas esgotadas
  -> handoff com contexto estruturado
```

## Coleta minima

| Perfil | Dados usados no fluxo |
|---|---|
| Tutor | perfil, motivo e, para assunto clinico/agenda/pet, nome e especie do pet |
| Cliente | perfil e motivo |
| Colaborador | perfil, motivo e setor/area |
| Fornecedor | perfil, motivo e empresa representada |
| Outro | perfil e motivo |

Nome, telefone e e-mail ja existentes no Chatwoot nao sao novamente solicitados. O intake limita comprimentos, mascara identificadores diretos e nao coleta CPF, CNPJ, endereco ou dados financeiros.

## Estado e recuperacao

- o estado `contact_intake` fica no contexto Redis para continuidade de baixa latencia;
- a coluna `conversations.contact_intake` preserva o funil apos perda/restart do Redis;
- a migration `20260802_zz_conversation_intake.sql` adiciona a coluna JSONB com restricao de objeto;
- valores restaurados do PostgreSQL sao validados antes de voltar ao runtime;
- anonimizacao LGPD limpa integralmente o intake e eliminacao remove a conversa.

## Uso do Qdrant

Depois da coleta, a consulta enviada ao retrieval inclui o perfil e o motivo retido. No Compose, `KNOWLEDGE_VECTOR_STORE=qdrant` conecta o runtime a collection configurada em `QDRANT_COLLECTION`. Somente chunks do tenant e acima do limiar de relevancia entram no contexto do agente.

Perfil declarado nao concede autorizacao. Como o contato do Chatwoot nao possui autenticacao de colaborador, tags `internal`, `interno`, `restrito`, `restricted`, `confidencial`, `confidential` e `staff-only` sao excluidas no filtro Qdrant e novamente validadas no runtime. O fallback PostgreSQL aplica a mesma regra.

## Handoff

O handoff registra e envia em nota privada do Chatwoot:

- perfil e motivo;
- pet/especie, setor ou empresa quando coletados;
- pergunta ainda pendente;
- resposta ja tentada;
- historico recente e razao tecnica da transferencia.

Urgencias ignoram o funil de coleta e geram handoff operacional imediato. Tres respostas consecutivas sem progresso na identificacao tambem transferem para humano. Falta de chunks relevantes, resposta de baixa confianca, erro do provedor ou falha operacional continuam fail-closed para handoff.

## Evidencias automatizadas

- `tests/unit/contact-intake.test.ts` cobre perfis, coleta, continuidade, mascaramento e tentativas;
- `tests/unit/app-chatwoot-flow.test.ts` cobre saudacao antes de RAG e fluxo completo Chatwoot -> intake -> retrieval -> IA;
- `tests/unit/agent-runtime-scheduling.test.ts` cobre Qdrant, baixa confianca, resumo e handoff de emergencia;
- `tests/knowledge/qdrant-store.test.ts` e `tests/knowledge/retrieval.test.ts` cobrem bloqueio de conhecimento interno;
- `tests/unit/conversation-repository.test.ts` e `tests/unit/contact-intake-migration.test.ts` cobrem persistencia tenant-aware;
- `tests/unit/privacy-adapters.test.ts` cobre a remocao do intake na anonimizacao.

Verificacao reproduzida em 02/08/2026:

- ESLint, TypeScript source/testes e build passaram;
- 101 arquivos de teste passaram e quatro condicionais foram ignorados;
- 871 testes passaram e 12 foram ignorados por dependerem de ambiente externo;
- cobertura: 83,90% statements, 77,10% branches, 87,24% funcoes e 84,62% linhas;
- sete migrations foram aplicadas e a segunda execucao ignorou 7/7 por checksum;
- stores reais passaram 5/5 e confiabilidade passou 7/7;
- carga de 500 jobs/12 workers terminou sem perda ou duplicacao.

## Deploy no ambiente integrado

Deploy executado em 02/08/2026 no host integrado ao Chatwoot, PostgreSQL, Redis e Qdrant:

- checkpoint PostgreSQL, `BGSAVE` Redis e snapshot `cvg_institucional-5279473244270512-2026-08-02-18-11-54.snapshot` criados antes da mudanca;
- a migration cumulativa foi ensaiada em restore do banco ativo e corrigida para suportar instalacoes legadas sem `sector_notifications`;
- sete migrations foram aplicadas no banco alvo e a repeticao ignorou 7/7 por checksum;
- role PostgreSQL de menor privilegio, ACL Redis e chaves de criptografia foram provisionadas;
- 11 contatos foram migrados para PII criptografada e nenhum identificador permaneceu nos campos legados verificados;
- imagem ativa `cvg-secretary-agent:intake-20260802-1823`, com a imagem anterior preservada como `rollback-pre-intake-20260802`;
- `health` e `ready` passaram antes e depois da troca e das recriacoes isoladas de Redis/PostgreSQL;
- webhook Chatwoot assinado retornou `202`, foi processado e criou a mensagem de recepcao `6210` na conversa de smoke;
- a resposta pediu perfil e motivo, e o replay do contrato real com campos opcionais nulos foi aceito e corretamente ignorado por ser mensagem de saida;
- os 429 chunks Qdrant foram vinculados ao tenant: 214 classificados como publicos e 215 como internos por padrao seguro;
- consulta real do runtime retornou cinco chunks publicos, com score maximo de 0,75.

O fluxo Chatwoot -> agente -> Chatwoot e o retrieval Qdrant estao ativos. A entrega final pelo numero WhatsApp ainda depende do roteamento externo EvolutionAPI/Chatwoot e deve continuar monitorada conforme `docs/72_residual_risk_and_go_no_go.md`.
