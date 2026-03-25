# 07 - Ingestão via Telegram

## Visão Geral

O Telegram é utilizado como canal administrativo interno para alimentação do agente, permitindo que a equipe do hospital atualize o conhecimento e as regras operacionais sem necessitar de acesso direto ao banco de dados ou infraestrutura.

## Telegram como Canal Interno

### Objetivos

| Objetivo | Descrição |
|----------|-----------|
| **Atualização de Conhecimento** | Enviar FAQs, políticas, procedimentos para o RAG |
| **Comandos Administrativos** | Controlar o sistema remotamente |
| **Feedback** | Aprovar ou rejeitar conteúdo ingested |
| **Monitoramento** | Receber alertas e notificações |

### Arquitetura do Bot

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Admin/     │───>│   Bot       │───>│   API do    │
│  Equipe     │    │  Telegram   │    │   Agente    │
└─────────────┘    └─────────────┘    └─────────────┘
                         │
                         ▼
                   ┌─────────────┐
                   │  Pipeline   │
                   │   de        │
                   │ Ingestão    │
                   └─────────────┘
```

## Tipos de Conteúdo Aceitos

### Mensagens de Texto

| Tipo | Formato | Destino |
|------|---------|---------|
| FAQ | Texto com P: e R: | knowledge_documents |
| Política | Texto com título | knowledge_documents |
| Procedimento | Texto com pasos | knowledge_documents |
| Regra | Texto com "REGRA:" | operational_rules |

### Comandos

| Comando | Ação |
|---------|------|
| `/start` | Boas-vindas e menu |
| `/help` | Ajuda |
| `/status` | Status do sistema |
| `/reload` | Recarregar conhecimento |
| `/stats` | Estatísticas |
| `/approve <id>` | Aprovar documento |
| `/reject <id>` | Rejeitar documento |

### Documentos

| Tipo | Processamento |
|------|---------------|
| PDF | Extrair texto, processar como conhecimento |
| Imagem | OCR + processamento |
| Áudio | Transcrição (futuro) |

### Limites

| Tipo | Limite |
|------|--------|
| Texto | 50 - 50.000 caracteres |
| Arquivo | 20MB |
| Imagem | 10MB |

## Fluxo de Ingestão

### Pipeline Completo

```
1. Mensagem recebe via Webhook Telegram
2. Sistema identifica tipo (texto/comando/arquivo)
3. Se comando: executar ação
4. Se conteúdo: classificar
5. Salvar em telegram_ingestions
6. Criar rascunho em destino
7. Notificar aprovadores
8. Aguardar aprovação
9. Se aprovado: processar e publicar
10. Se rejeitado: marcar como rejeitado
```

### Fluxo Detalhado

```
┌──────────────┐
│ Recebe msg  │ 
└──────┬───────┘
       ▼
┌──────────────┐
│  É comando?  │───Sim──>┌──────────────┐
└──────┬───────┘          │ Executar    │
       │Não               │ comando      │
       ▼                  └──────────────┘
┌──────────────┐               │
│  Classificar │               │
│  conteúdo    │               ▼
└──────┬───────┘         ┌──────────────┐
       │                 │  Resposta    │
       ▼                 │  ao admin    │
┌──────────────┐         └──────────────┘
│  Criar       │
│  rascunho    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Notificar   │
│  aprovador   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Aguardar    │
│  aprovação   │
└──────┬───────┘
       │
       ▼
  ┌────┴────┐
  │         │
Sim         Não
 │         │
 ▼          ▼
┌────────┐ ┌────────┐
│Publi-  │ │Rejeitar│
│car     │ └────────┘
└────────┘
```

## Classificação

### Classificador Automático

O sistema classifica automaticamente o conteúdo recebido:

| Classificação | Critério | Destino |
|---------------|----------|---------|
| `faq` | Contém "P:" e "R:" ou "Pergunta" | knowledge_documents |
| `policy` | Contém "POLÍTICA" ou "POLICY" | knowledge_documents |
| `procedure` | Contém passos numerados | knowledge_documents |
| `rule` | Contém "REGRA" ou "RULE" | operational_rules |
| `command` | Começa com "/" | Execução direta |
| `feedback` | Contém feedback keywords | Tabela de feedback |

### Metadados Extraídos

```typescript
interface ClassifiedContent {
  classification: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  confidence: number;
}
```

## Validação

### Regras de Validação

| Regra | Descrição | Ação se Falhar |
|-------|-----------|----------------|
| Tamanho mínimo | 50 caracteres | Rejeitar |
| Tamanho máximo | 50.000 caracteres | Truncar e notificar |
| Idioma | Português (prioritário) | Aceitar mesmo assim |
| Título | Obrigatório | Adicionar baseado em conteúdo |
| Encoding | UTF-8 | Converter |

### Validação de Segurança

- **XSS**: Remover scripts
- **Links**: Validar domínios permitidos
- **Dados sensíveis**: Não processar dados de clientes

## Destino: RAG ou Postgres Estruturado

### Decisão de Destino

| Tipo de Conteúdo | Destino Primário | Destino Secundário |
|------------------|------------------|-------------------|
| FAQ | Vector Store (RAG) | - |
| Políticas | Vector Store (RAG) | Postgres (structured) |
| Procedimentos | Vector Store (RAG) | - |
| Regras operacionais | Postgres (structured) | - |
| Catálogo de serviços | Postgres (structured) | Vector Store |
| Horários | Postgres (structured) | - |

### Processamento por Destino

#### Para RAG (Vector Store)

```
1. Limpar e formatar texto
2. Criar chunks
3. Gerar embeddings
4. Salvar no vector store
5. Criar documentos em knowledge_documents
6. Publicar chunks
```

#### Para Postgres (Estruturado)

```
1. Parsear conteúdo
2. Mapear para schema
3. Validar dados
4. Salvar em tabela destino
5. Se aplicável, criar chunk para RAG
```

## Moderação e Aprovação

### Fluxo de Aprovação

```
DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED
                                    ↓
                                REJECTED
```

### Papéis

| Papel | Comandos |
|-------|----------|
| Admin | Aprovar, Rejeitar, Publicar diretamente |
| Editor | Criar, Editar, Enviar para review |
| Visualizador | Apenas ver |

### Notificação de Aprovação

Quando conteúdo precisa de aprovação:

```markdown
📝 Novo conteúdo para revisão

ID: abc123
Tipo: FAQ
Título: Como agendar emergência?

Pré-visualização:
P: Como funciona o atendimento de emergência?
R: Nosso atendimento de emergência funciona...

/approve abc123  - Aprovar
/reject abc123   - Rejeitar
```

## Versionamento

### Controle de Versão

Cada documento mantém histórico de versões:

```sql
knowledge_documents:
  - id: uuid
  - version: 1
  - previous_version_id: null
  - content: "..."
  
  (apos update)
  
  - id: uuid (novo)
  - version: 2
  - previous_version_id: uuid_v1
  - content: "..."
```

### Diff de Versões

Sistema mantém diff entre versões para auditoria:

```json
{
  "version": 2,
  "changes": [
    { "type": "modified", "field": "content", "old": "...", "new": "..." }
  ],
  "changed_by": "admin",
  "changed_at": "2024-01-15T10:00:00Z"
}
```

## Trilha de Auditoria

### Logs de Auditoria

Toda operação é logada:

```json
{
  "event": "telegram_content_received",
  "chat_id": 123456789,
  "message_id": 111,
  "classification": "faq",
  "status": "pending_review",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

### Eventos Auditados

| Evento | logging |
|--------|---------|
| Mensagem recebida | Sempre |
| Classificação | Sempre |
| Rascunho criado | Sempre |
| Aprovação | Sempre |
| Rejeição | Sempre |
| Publicação | Sempre |
| Erro | Sempre |

### Retenção de Logs

| Log | Retenção |
|-----|----------|
| Auditoria completa | 2 anos |
| Telegram messages | 90 dias |
| Conteúdo rejected | 30 dias |

## Exemplos de Uso

### Exemplo 1: Adicionar FAQ

```
Admin envia:
P: Qual o horário de atendimento de emergência?
R: Nosso atendimento de emergência funciona 24 horas, 
   7 dias por semana. Ligue antes de venir: (11) 99999-9999.

Sistema:
→ Classifica como "faq"
→ Cria rascunho em knowledge_documents
→ Notifica admin para aprovação
→ Admin aprova
→ Publica no RAG
```

### Exemplo 2: Atualizar Política

```
Admin envia:
POLÍTICA: Cancelamento

Clientes podem cancelar até 24h antes do agendamento 
sem custo. Cancelamentos com menos de 24h têm taxa 
de 50% do valor do procedimento.

Sistema:
→ Classifica como "policy"
→ Cria nova versão do documento
→ Notifica aprovação
→ Publica
```

### Exemplo 3: Comando de Status

```
Admin envia:
/status

Sistema responde:
🤖 Status do Agente

● Runtime: Online
● Redis: Conectado
● Postgres: Conectado
● Vector Store: Conectado
● Última conversa: 5 min atrás
● Mensagens hoje: 42
```
