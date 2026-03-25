# 08 - Sistema de Handoff

## Visão Geral

O sistema de handoff é o mecanismo pelo qual o agente transfere uma conversa para um atendente humano. É crucial para garantir que situações que requerem discernimento humano, empatia avançada ou autoridade decisória sejam tratadas adequadamente.

## O que é Handoff

Handoff é a transferência controlada de uma conversa do agente automatizado para um atendente humano. Durante o handoff:

1. O agente para de processar novas mensagens
2. Um resumo completo é gerado
3. O atendimento humano é solicitado
4. Contexto é passado para o atendente
5. Cliente é notificado da transferência

## Quando Abrir Handoff

### Gatilhos Automáticos

| Gatilho | Descrição | Prioridade |
|---------|-----------|------------|
| **Urgência clínica** | Pet em emergência ou condição grave | Crítica |
| **Conflito** | Cliente insatisfeito ou em conflito | Alta |
| **Financeiro sensível** | Discussão de valores, reembolsos | Alta |
| **Limitação do agente** | Não consegue executar ação necessária | Média |
| **Baixa confiança** | Incerteza sobre resposta correta | Média |
| **Erro de ferramenta** | Falha em executar ferramenta | Média |
| **Solicitação explícita** | Cliente pede atendente | Alta |

### Detalhes por Gatilho

#### Urgência Clínica

**Sinais de alerta**:
- "meu pet não consegue respirar"
- "pet comeu veneno"
- "pet está sangrando muito"
- "pet não consegue andar"
- "pet teve convulsão"

**Ação imediata**:
```
1. Reconhecer emergência
2. NÃO tentar ajudar além de orientação básica
3. Direcionar para atendimento de urgência
4. Transferir imediatamente
5. Se possível, oferecer ligação
```

#### Conflito / Reclamação

**Sinais de alerta**:
- "quero falar com responsável"
- "isso é um absurdo"
- "vou procurar os órgãos de defesa"
- Tom agressivo ou ameaçador

**Ação**:
```
1. Não entrar em conflito
2. Pedir desculpas pela experiência
3. Oferecer solução dentro do possível
4. Se não resolver, transferir
```

#### Financeiro Sensível

**Sinais de alerta**:
- "isso é muito caro"
- "não tenho como pagar"
- "quero reembolso"
- Discussão de desconto

**Ação**:
```
1. Mostrar empatia
2. Explicar valor se necessário
3. Oferecer alternativas (parcelamento, etc)
4. Se decisão financeira necessária, transferir
```

#### Limitação do Agente

**Cenários**:
- Agendar em data específica indisponível
- Executar ação não implementada
- Informação não disponível na base

**Ação**:
```
1. Ser honesto sobre limitação
2. Oferecer o que for possível
3. Transferir para completar ação
```

#### Baixa Confiança

**Critérios para detecção**:
- Score de confiança < 0.6 em facts extraídos
- Múltiplas intents detectadas sem clareza
- Busca no RAG retornou resultados de baixa similaridade

**Ação**:
```
1. Ser transparente sobre incerteza
2. Confirmar com cliente se resposta foi útil
3. Se cliente confirmar dúvida, transferir
```

#### Erro de Ferramenta

**Cenários**:
- Falha ao salvar dados
- Falha ao buscar informações
- Timeout de ferramenta
- Dados inconsistentes retornados

**Ação**:
```
1. Reconhecer erro
2. Tentar novamente se possível
3. Se persistir, transferir com contexto do erro
```

## Como Resumir para o Humano

### Estrutura do Resumo

O resumo deve conter:

```markdown
📋 RESUMO DA CONVERSA

📅 Data/Hora: [data]
👤 Cliente: [nome]
🐾 Pet(s): [nomes e espécies]

📝 O QUE O CLIENTE QUERIA:
[Descrição curta do motivo do contato]

💬 HISTÓRICO DA CONVERSA:
1. Cliente: [mensagem 1]
2. Agente: [resposta 1]
3. Cliente: [mensagem 2]
[...]

🔍 INFORMAÇÕES COLETADAS:
- Telefone: [se coletado]
- Email: [se coletado]
- Pet: [dados do pet]
- Preferências: [se coletado]

⚠️ MOTIVO DA TRANSFERÊNCIA:
[Explicação clara de por que está sendo transferido]

❓ PERGUNTAS PENDENTES:
- [Pergunta 1]
- [Pergunta 2]

✅ JÁ TENTAMOS:
- [Solução 1]
- [Solução 2]
```

### Exemplo de Resumo

```markdown
📋 RESUMO DA CONVERSA

📅 Data/Hora: 15/01/2024 14:30
👤 Cliente: Maria Santos
🐾 Pet(s): Buddy (cachorro, 5 anos)

📝 O QUE O CLIENTE QUERIA:
Cliente quer agendar banho e tosa para o Buddy, mas está 
insatisfeita com o último atendimento (pet ficou muito tempo 
esperando).

💬 HISTÓRICO DA CONVERSA:
1. Cliente: Olá! Gostaria de agendar banho no meu cachorro
2. Agente: Olá Maria! Que bom falar com você! Para agendar, 
   preciso saber o nome do pet e qual serviço deseja.
3. Cliente: É o Buddy,昨日 ele fez banho aqui e não gostei 
   porque ficou esperando demais
4. Agente: Entendo sua preocupação. Vou registrar seu feedback. 
   Gostaria de agendar o banho mesmo assim?
5. Cliente: Quero falar com responsável sobre isso

⚠️ MOTIVO DA TRANSFERÊNCIA:
Cliente insatisfeita com atendimento anterior e pedindo 
responsável. Conflito que requer intervenção humana.

❓ PERGUNTAS PENDENTES:
- Cliente quer reclamar formalmente?
- Deseja agendar banho mesmo assim?
- Quer desconto ou crédito para próxima vez?

✅ JÁ TENTAMOS:
- Empatia e pedido de desculpas
- Oferecimento de agendamento
```

## Como Marcar no Chatwoot

### Labels

Adicionar labels automaticamente:

| Label | Descrição |
|-------|-----------|
| `handoff` | Indica que foi transferência do agente |
| `urgent` | Se urgência clínica |
| `complaint` | Se reclamação |
| `financial` | Se tema financeiro |

### Notas Internas

Criar nota interna com resumo completo (conforme estrutura acima).

### Status

- Manter como `open` (não resolver automaticamente)
- Atribuir a atendente disponível

## Como Evitar Respostas Paralelas Após Transferência

### Mecanismo de Lock

```
1. Ao detectar necessidade de handoff:
   - SET conversation:lock:{id} = "handoff"
   - TTL: 4 horas

2. Cliente envia nova mensagem:
   - Verificar lock
   - Se locked: NÃO processar
   - Resposta automática: "Aguarde, você está sendo atendido"

3. Atendente assume conversa:
   - Lock removido automaticamente
   - Ou manualmente quando atendente inicia
```

### Mensagem Automática Durante Lock

```markdown
Aguarde um momento, por favor! 

Um de nossos atendentes vai assumir seu atendimento 
em instantes. ⏳
```

### Desativação do Lock

O lock é removido quando:
- Atendente envia primeira mensagem
- Timeout de 4 horas
- Comando manual de unlock

## Retorno do Humano para Automação

### Quando Retornar

| Cenário | Ação |
|---------|------|
| Questão resolvida | Atendente pode encerrar |
| Dúvida simples | Atendente pode repassar para agente |
| Novo assunto | Manter com humano |

### Processo de Retorno

```
1. Atendente responde última dúvida
2. Cliente confirma que está tudo certo
3. Atendente transfere de volta para agente
4. Mensagem do agente: "Retornando ao atendimento automático"
5. Agente continua monitoramento
```

### Configuração de Retorno

| Configuração | Valor |
|--------------|-------|
| Máximo de handoffs por conversa | 3 |
| Tempo máximo em handoff | 4 horas |
| Auto-retorno se handoff vazio | 30 minutos |

## Métricas de Handoff

### KPIs

| Métrica | Descrição | Meta |
|---------|-----------|------|
| Taxa de handoff | % de conversas com handoff | 20-40% |
| Handoff apropriado | % de handoffs que eram necessários | > 80% |
| Tempo de resolução | Tempo do handoff até resolução | < 30 min |
| Retorno ao agente | % que volta para o agente | < 10% |

### Feedback Loop

Após handoff, sistema pode capturar:
- Se foi resolvido
- Se cliente ficou satisfeito
- Se handoff foi apropriado

## Fluxo Completo de Handoff

```
┌─────────────┐
│  Detecta    │────────────┐
│  necessidade│            │
└─────────────┘            ▼
                  ┌─────────────┐
                  │  Gera       │
                  │  resumo     │
                  └─────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  Adiciona   │
                  │  labels     │
                  └─────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  Cria nota  │
                  │  interna   │
                  └─────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  Atribui    │
                  │  atendente  │
                  └─────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  Notifica   │
                  │  cliente    │
                  └─────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  Ativa lock │
                  │  (evita     │
                  │  resposta)  │
                  └─────────────┘
```
