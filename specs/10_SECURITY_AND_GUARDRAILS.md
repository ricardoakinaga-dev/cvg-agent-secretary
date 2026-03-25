# 10 - Segurança e Guardrails

## Visão Geral

Este documento define os guardrails (proteções) e políticas de segurança do CVG Secretary Agent para garantir operação segura, proteção de dados e conformidade regulatória.

## Proibições Absolutas

### Limites Clínicos

O agente **NUNCA** deve realizar as seguintes ações:

| Proibição | Descrição | Ação Correta |
|-----------|-----------|--------------|
| **Diagnóstico** | Diagnosticar condições de saúde | "Apenas um veterinário pode avaliar" |
| **Prescrição** | Prescrever medicamentos | "Consulte o veterinário" |
| **Prognóstico** | Prever resultados de tratamentos | "Cada caso é diferente" |
| **Interpretação de exames** | Interpretar resultados laboratoriais | "O veterinário vai avaliar" |
| **Recomendação de tratamento** | Sugerir procedimentos específicos | "O veterinário vai indicar" |
| **Substituição de consulta** | Dizer que não precisa ir ao veterinário | "É importante consultar" |

### Limites Operacionais

O agente **NUNCA** deve:

| Proibição | Descrição |
|-----------|-----------|
| **Inventar informação** | Criar dados que não existem |
| **Confirmar agenda sem fonte** | Confirmar horários sem verificar |
| **Alterar políticas** | Modificar regras do hospital |
| **Tratar emergência como FAQ** | Responder emergência com informações básicas |
| **Acessar dados de outros clientes** | Buscar informações de outros contatos |
| **Compartilhar dados sensíveis** | Expor dados pessoais |

## Critérios de Fallback

### Quando Usar Fallback

| Situação | Ação |
|----------|------|
| **Informação não encontrada no RAG** | Admitir desconhecimento, oferecer verificar |
| **Baixa confiança na resposta** | Ser honesto sobre incerteza |
| **Contradição de informações** | Priorizar fonte mais confiável |
| **Pergunta fora do escopo** | Redirecionar para escopo |

### Tipos de Fallback

```typescript
type FallbackResponse = 
  | "no_knowledge"    // Não encontrou informação
  | "low_confidence"   // Encontrou mas com baixa certeza
  | "clarification"    // Precisa de mais informações
  | "handoff_needed";  // Precisa de humano
```

### Respostas de Fallback

| Tipo | Template |
|------|----------|
| no_knowledge | "Não tenho essa informação específica. Posso verificar ou transferir para um atendente." |
| low_confidence | "Não tenho certeza sobre isso. Para garantir a informação correta, vou verificar com um atendente." |
| clarification | "Para ajudar melhor, você poderia me explicar mais sobre..." |
| handoff_needed | "Vou transferir para um atendente que pode te ajudar com isso." |

## Critérios de Bloqueio

### Conteúdo Bloqueado

| Tipo | Como Detectar | Ação |
|------|---------------|------|
| **Conteúdo clínico** | Keywords de sintomas/doenças | Bloquear, sugerir agendamento |
| **Dados pessoais sensíveis** | CPF, RG, dados financeiros | Não processar, registrar |
| **Conteúdo impróprio** | Palavras-chave de abuso | Bloquear, escalar |
| **Tentativa de jailbreak** | Prompts de manipulação | Bloquear, registrar |

### Palavras-Chave de Bloqueio Clínico

```
Sintomas de emergência:
- "não consegue respirar"
- "não consegue andar"
- "convulsão"
- "sangramento"
- "ingeriu veneno"
- "ingiriu objeto"

Esses disparadores devem acionar transferência imediata, não resposta automática.
```

## Critérios de Escalonamento Humano

### Escalonar Imediatamente

| Cenário | Prioridade |
|---------|------------|
| Emergência clínica | CRÍTICA |
| Reclamação grave | ALTA |
| Solicitação de médico veterinário | ALTA |
| Questão financeira complexia | MÉDIA |
| Múltiplas tentativas sem sucesso | MÉDIA |
| Solicitação explícita | ALTA |

### Indicadores de Emergência

O agente deve detectar e escalar:

```
1. [CRÍTICO] "meu pet não consegue respirar"
2. [CRÍTICO] "meu pet teve convulsão"
3. [CRÍTICO] "meu pet comeu veneno/rato"
4. [ALTO] "meu pet está muito doente"
5. [ALTO] "meu pet não está se movendo"
6. [MÉDIO] "meu pet não come há X dias"
```

## Regras de Privacidade

### Dados Pessoais (LGPD)

| Dado | Categoria | Proteção |
|------|-----------|----------|
| Nome | Básico | Armazenar com consentimento |
| Email | Básico | Não compartilhar |
| Telefone | Básico | Usar apenas para contato |
| CPF | Sensível | Criptografar, acesso restrito |
| Endereço | Básico | Não expor |
| Dados de pets | Básico | Tratar como dados do tutor |

### Princípios LGPD Aplicados

1. **Minimização**: Coletar apenas o necessário
2. **Finalidade**: Usar apenas para atendimento
3. **Consentimento**: Informar uso dos dados
4. **Segurança**: Proteger contra acesso não autorizado
5. **Direito de exclusão**: Suportar delete de dados

### Retenção de Dados

| Tipo de Dado | Retenção |
|--------------|----------|
| Mensagens | 90 dias |
| Memórias ativas | Indefinido |
| Memórias inativas | 2 anos |
| Logs de auditoria | 2 anos |
| Dados excluídos | 즉시删除 |

## Regras de Auditoria

### O que Auditar

| Evento | logging | Detalhe |
|--------|---------|---------|
| Mensagem recebida | ✅ | Apenas hash |
| Resposta enviada | ✅ | Conteúdo |
| Ferramenta executada | ✅ | Input/Output |
| Handoff criado | ✅ | Completo |
| Memória salva | ✅ | Completo |
| Erro | ✅ | Stack trace |
| Tentativa de acesso indevido | ✅ | Completo |

### Não Auditar (Privacidade)

- CPF de clientes em logs
- Dados financeiros
- Histórico médico de pets
- Conversas inteiras (apenas resumo)

## Mitigação de Alucinação

### Definição

Alucinação = Informar como fato algo que não é verdade ou que o sistema não sabe.

### Estratégias de Mitigação

#### 1. Fonte como Prefixo
Toda resposta deve indicar fonte:
```
[Base de Conhecimento] Nosso horário de funcionamento...
[Minha memória] Sobre o seu pet Buddy...
[Não sei] Não tenho essa informação...
```

#### 2. Certeza Adaptativa

| Nível de Certeza | Resposta |
|------------------|----------|
| > 95% | Afirmativo |
| 70-95% | "Creio que..." |
| 50-70% | "Não tenho certeza, mas..." |
| < 50% | "Não sei, posso verificar?" |

#### 3. Verificação Cruzada

Para informações críticas:
1. Buscar no RAG
2. Buscar no Postgres
3. Comparar resultados
4. Se divergente, não afirmar

#### 4. blacklist de Afirmações Proibidas

```
NUNCA afirmar:
- Diagnóstico
- Prognóstico
- Eficácia de tratamento
- Custo exato (sempre "consulte")
- Disponibilidade exata (sempre "verificar")
- Informações pessoais de outros
```

## Segurança Técnica

### Autenticação

| Componente | Método |
|------------|--------|
| API Chatwoot | API Key + Webhook verification |
| API OpenAI | API Key (.env) |
| Postgres | Connection string com credentials |
| Redis | Password |
| Telegram Bot | Bot Token |
| Webhook endpoints | HMAC signature |

### Rate Limiting

| Endpoint | Limite |
|----------|--------|
| Mensagens recebidas | 10/min/conversa |
| Handoffs | 5/min/conversa |
| Ferramentas | 20/min/conversa |
| API admin | 100/min/IP |

### Validação de Input

| Campo | Validação |
|-------|-----------|
| phone | Regex: ^\+?[0-9]{10,15}$ |
| email | Regex: padrão email |
| name | Min 2, max 255 chars |
| cpf | Regex: XXX.XXX.XXX-XX |
| message | Max 10000 chars |

## Monitoramento de Segurança

### Alertas Críticos

| Alerta | Condição | Ação |
|--------|----------|------|
| Tentativa de Injection | Prompt injetado | Bloquear + Alertar |
| Acesso anômalo |many falhas de auth | Bloquear + Alertar |
| Dados sensíveis expostos | Log contendo CPF | Alertar + Máscarar |
| Handoff em loop | 3+ handoffs em 10 min | Alertar |

### Dashboard de Segurança

- Tentativas de acesso bloqueadas
- Rate limits atingidos
- Erros de autenticação
- Handoffs anômalos
