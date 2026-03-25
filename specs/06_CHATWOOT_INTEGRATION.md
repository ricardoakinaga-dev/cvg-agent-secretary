# 06 - Integração com Chatwoot

## Visão Geral

O Chatwoot é o canal principal de atendimento ao cliente. Esta especificação detalha como o CVG Secretary Agent se integra com o Chatwoot para receber mensagens, enviar respostas e gerenciar conversas.

## Eventos Relevantes do Chatwoot

### Webhooks Configurados

| Evento | Endpoint | Ação |
|--------|----------|------|
| `conversation_created` | `/webhooks/chatwoot` | Nova conversa iniciada |
| `conversation_status_changed` | `/webhooks/chatwoot` | Status alterado |
| `conversation_updated` | `/webhooks/chatwoot` | Conversa atualizada |
| `message_created` | `/webhooks/chatwoot` | Nova mensagem recebida |
| `message_updated` | `/webhooks/chatwoot` | Mensagem editada |

### Payload do Webhook (message_created)

```json
{
  "event": "message_created",
  "id": 1234567890,
  "conversation": {
    "id": 12345,
    "uuid": "uuid-da-conversa",
    "account_id": 1,
    "inbox_id": 2,
    "status": "open",
    "assignee_id": null,
    "contact": {
      "id": 67890,
      "name": "Maria Santos",
      "email": "maria@email.com",
      "phone_number": "+5511999999999",
      "identifier": "external_id_123"
    }
  },
  "message": {
    "id": 1111111111,
    "content": "Olá, bom dia! Gostaria de informações sobre horário de atendimento.",
    "message_type": "incoming",
    "sender": {
      "id": 67890,
      "name": "Maria Santos",
      "type": "contact"
    },
    "attachments": [],
    "private": false
  }
}
```

## Recebimento de Mensagens

### Fluxo de Recebimento

```
Chatwoot Webhook → API Gateway → Normalização → Deduplicação → Fila de Processamento
```

### Normalização de Mensagem

O sistema converte o payload do Chatwoot para formato interno:

```typescript
interface NormalizedMessage {
  messageId: string;           // UUID único interno
  chatwootMessageId: number;   // ID no Chatwoot
  conversationId: string;      // UUID interno
  chatwootConversationId: number;
  contactId: string;           // UUID interno
  chatwootContactId: number;
  content: string;
  messageType: 'incoming' | 'outgoing' | 'system';
  senderType: 'user' | 'agent' | 'bot';
  senderName: string;
  timestamp: Date;
  attachments: Attachment[];
}
```

## Envio de Mensagens de Resposta

### API de Envio

O agente envia mensagens via Chatwoot API:

```
POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
```

```json
{
  "content": "Olá, Maria! Bom dia! 😊\n\nNosso horário de atendimento é...",
  "private": false
}
```

### Configurações de Envio

| Configuração | Valor |
|--------------|-------|
| Tipo de mensagem | Normal (não privada) |
| Formato | Markdown suportado |
| Anexos | Suportados |
| Template messages | Não usar no MVP |

### Limites e Rate Limits

| Limite | Valor | Observação |
|--------|-------|------------|
| Mensagens por minuto | 10 | Por conversa |
| Tamanho por mensagem | 10KB | Limite Chatwoot |
|Retry em falha | 3 | Com backoff |

## Labels

### Labels Automáticas

O sistema pode adicionar labels automaticamente:

| Label | Quando Aplicar |
|-------|----------------|
| `agent` | Mensagem respondida pelo agente |
| `handoff` | Conversa transferida para humano |
| `resolved` | Conversa resolvida pelo agente |
| `pending` | Aguardando resposta do cliente |
| `escalated` | Escalada para supervisor |

### Labels Manuais (Atendente)

Labels que atendentes podem adicionar:
- `priority` - Alta prioridade
- `follow-up` - Precisa follow-up
- `vip` - Cliente VIP
- `complaint` - Reclamação

## Assign (Atribuição)

### Fluxo de Atribuição

| Estado | Atribuição | Quem |
|--------|------------|------|
| Nova conversa | Agent (sistema) | Automático |
| Handoff | Atendente disponível | Automático |
| Retorno do handoff | Agent (sistema) | Automático |
| Conversa resolvida | Agent (sistema) | Automático |

### Critérios de Atribuição no Handoff

- **Menor carga**: Atribuir para atendente com menos conversas ativas
- **Especialização**: Se aplicável, direcionar para setor específico
- **Round-robin**: Se carga igual, distribuir igualmente

## Takeover / Handoff

### Quando Ocorre

| Gatilho | Descrição |
|---------|-----------|
| **Urgência clínica** | Pet em emergência |
| **Complexidade** | Não consegue resolver |
| **Baixa confiança** | Incerteza na resposta |
| **Erro de ferramenta** | Falha ao executar ação |
| **Solicitação explícita** | Cliente pede atendente |
| **Reclamação** | Cliente insatisfeito |

### Processo de Handoff

```
1. Agente identifica necessidade de handoff
2. Gera resumo da conversa
3. Cria nota interna com contexto
4. Adiciona label 'handoff'
5. Atribui a atendente disponível
6. Altera status para 'open' (se estava 'pending')
7. Envia mensagem de transferência para cliente
8. Notifica atendente (se aplicável)
```

### Mensagem de Transferência

```
Foi um prazer ajudar! 👋

Por agora, vou transferir você para um de nossos atendentes que 
poderá continuar te auxiliando com mais detalhes.

[Atenção atendente]: Resumo da conversa: [resumo]
```

## Notas Internas

### Criação de Nota Interna

O sistema pode criar notas internas para o atendente:

```
POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
```

```json
{
  "content": "📋 RESUMO DA CONVERSA\n\nCliente: Maria Santos\nPet: Buddy (cachorro)\n\nMotivo do contato: Dúvida sobre horário\n\nHistórico: Cliente frequente, última visita há 2 meses.\n\nStatus: Transferido por baixa confiança na resposta.",
  "private": true
}
```

### Conteúdo da Nota

A nota deve conter:
- Resumo do que foi conversado
- Dados do cliente (se conhecidos)
- Dados do pet (se mencionados)
- Motivo da transferência
- Próximos passos recomendados

## Regras de Deduplicação

### Problema

O Chatwoot pode enviar o mesmo webhook múltiplas vezes (retry).

### Solução

```
1. Gerar hash da mensagem: SHA256(conversationId + messageId + content)
2. Verificar se hash existe no Redis
3. Se existe: ignorar (já processado)
4. Se não existe: processar e adicionar ao Redis com TTL de 1 hora
```

### Implementação

```typescript
async function isDuplicate(message: NormalizedMessage): Promise  const hash =<boolean> {
 crypto
    .createHash('sha256')
    .update(`${message.chatwootConversationId}-${message.chatwootMessageId}`)
    .digest('hex');
  
  const key = `message:hash:${hash}`;
  const exists = await redis.exists(key);
  
  if (!exists) {
    await redis.setex(key, 3600, '1'); // 1 hora
    return false;
  }
  
  return true;
}
```

## Regras para Evitar Resposta Dupla

### Cenário: Humano e Agente Respondem

O sistema deve evitar que agente e humano respondam simultaneamente.

### Solução: Lock de Conversa

```
1. Ao iniciar processamento: SET conversation:lock:{id} = timestamp
2. Após responder: DEL conversation:lock:{id}
3. Ao receber mensagem: Verificar lock
   - Se locked: não processar (humano está respondendo)
   - Se não locked: processar normalmente
4. TTL do lock: 5 minutos (timeout de segurança)
```

### Fluxo de Resposta Humana

```
1. Atendente abre conversa no Chatwoot
2. Chatwoot envia webhook "conversation_updated"
3. Sistema detecta: assignee_id mudou de null para número
4. Sistema marca conversa como "human_responding"
5. Agente para de processar mensagens dessa conversa
```

## Vínculo com Conversa, Contato e Inbox

### Mapeamento

| Entidade Chatwoot | Entidade Interna | Tabela |
|------------------|------------------|--------|
| conversation.id | conversation_id | conversations |
| conversation.contact.id | contact_id | contacts |
| conversation.inbox_id | inbox_id | (config) |

### Inboxes Suportados

| Inbox | Channel Type | Suporte |
|-------|--------------|---------|
| Website | Website widget | ✅ Completo |
| Facebook | Facebook | ✅ Completo |
| Instagram | Instagram | ✅ Completo |
| WhatsApp | WhatsApp (Business) | ✅ Completo |
| Telegram | Telegram | ✅ Completo |
| Email | Email | ⚠️ Parcial (sem attachments complexos) |

## Estados da Conversa

### Mapeamento de Status

| Status Chatwoot | Significado | Ação do Agente |
|----------------|-------------|----------------|
| `open` | Aberta, sem atendente | Processar normalmente |
| `pending` | Aguardando resposta do cliente | Agente pode continuar |
| `resolved` | Resolvida | Não processar mais |
| `closed` | Fechada | Não processar mais |

### Transições de Status

```
open → pending (após resposta do agente, aguardando cliente)
open → resolved (após resposta que resolve questão)
pending → open (cliente responde)
open/pending → closed (atendente fecha manualmente)
resolved → open (cliente responde após resolvido)
```

### Monitoramento de Status

O sistema escuta webhooks de mudança de status para:
- Parar de processar conversas resolvidas/fechadas
- Retomar processamento se reopen
- Atualizar contadores de métricas
