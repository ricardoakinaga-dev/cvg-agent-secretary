# 05 - Segurança e Guardrails

## Objective

Estabelecer um sistema robusto de segurança e guardrails para o CVG Agent Secretary, garantindo que o assistente virtual opere dentro de limites seguros, proteja dados sensíveis, e faça escalação apropriada para atendentes humanos quando necessário.

## Scope

### In Scope
- Guardrails de conteúdo (o que o agente pode/não pode responder)
- Detecção de emergências
- Classificação de risco
- Sistema de handoff de segurança
- Proteção de dados sensíveis

### Out of Scope
- Segurança de infraestrutura
- Autenticação de APIs
- Criptografia de dados em repouso

## Detailed Tasks

### 5.1 - Guardrails de Conteúdo

#### Regras Atuais (Implementadas)
```typescript
// src/modules/openai/client.ts - System Prompt
const SYSTEM_PROMPT = `
## Regras de Conduta
1. NUNCA forneça diagnóstico médico
2. NUNCA prescreva medicamentos
3. NUNCAfaça prognósticos
4. NÃO invente informações
5. Sempre sugira agendamento quando houver dúvidas de saúde
6. Em emergências, oriente busca de atendimento urgente imediato
`;
```

#### Tarefas de Expansão
1. **Adicionar guardrails específicos para:**
   - Informações financeiras (não expor valores)
   - Dados de pets (restringir acesso a histórico médico)
   - Informações pessoais (LGPD)

2. **Criar módulo de guarda de conteúdo** (`src/modules/security/content-guard.ts`)

### 5.2 - Detecção de Emergências

#### Implementação Atual
```typescript
// src/modules/intent/classifier.ts - Urgency Indicators
const URGENCY_INDICATORS: UrgencyIndicator[] = [
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:não\s+)?(?:consegue)\s+respirar/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - dificuldade respiratória',
    riskLevel: 'high',
  },
  // ... mais padrões
];
```

#### Bugs a Corrigir
| Bug | Arquivo | Linha | Correção |
|-----|---------|-------|----------|
| Regex incorreto | intent/classifier.ts | 51 | Remover `movement\|mover` |

### 5.3 - Classificação de Risco

#### Níveis de Risco
| Nível | Critério | Ação |
|-------|----------|------|
| **critical** | Emergência de vida | Handoff imediato |
| **high** | Reclamação, questão financeira | Handoff prioritário |
| **medium** | Dúvida clínica, agendamento | Resposta com fallback |
| **low** | Consulta geral, greetings | Resposta normal |

#### Implementação
```typescript
// src/modules/intent/classifier.ts
function detectUrgency(message: string): { priority, requiresHandoff, reason, riskLevel } {
  for (const indicator of URGENCY_INDICATORS) {
    if (indicator.pattern.test(message)) {
      return {
        priority: indicator.priority,
        requiresHandoff: indicator.requiresHandoff,
        reason: indicator.handoffReason,
        riskLevel: indicator.riskLevel,
      };
    }
  }
  return null;
}
```

### 5.4 - Sistema de Handoff de Segurança

#### Fluxo de Handoff
```
Mensagem recebida
       ↓
Classificar intenção
       ↓
Avaliar risco
       ↓
┌──────┴──────┐
│             │
Alto risco    Baixo risco
    ↓             ↓
Handoff       Processar normalmente
imediato
```

#### Tipos de Handoff
| Tipo | Gatilho | Prioridade |
|------|---------|------------|
| Emergência | Padrão crítico | critical |
| Reclamação | Reclamação severa | high |
| Financeiro | Questão sensível | high |
| Humano | Pedido explícito | high |
| Desconhecido | Múltiplas falhas | medium |

### 5.5 - Proteção de Dados

#### Dados Sensíveis a Proteger
- CPF/CNPJ
- Informações médicas de pets
- Histórico financeiro
- Dados de contato

#### Implementação
```typescript
// src/modules/security/data-protection.ts
const SENSITIVE_PATTERNS = [
  /\d{3}\.\d{3}\.\d{3}-\d{2}/, // CPF
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/, // CNPJ
];

function maskSensitiveData(text: string): string {
  // Implementar mascaramento
}
```

## Affected Files

- `src/modules/intent/classifier.ts` - Classificação e detecção
- `src/modules/security/` - Módulo de segurança
- `src/modules/openai/client.ts` - System prompt
- `src/modules/handoff/` - Sistema de handoff

### Arquivos a Criar
- `src/modules/security/content-guard.ts`
- `src/modules/security/data-protection.ts`

## Validation Checkpoints

- [x] Guardrails básicos implementados
- [x] Detecção de emergências implementada
- [x] Classificação de risco implementada
- [ ] Bugs de regex corrigidos
- [ ] Mascaramento de dados implementado
- [ ] Testes de guardrails adicionados

## Métricas de Segurança

| Métrica | Meta | Alerta |
|---------|------|--------|
| Taxa de handoff de segurança | >95% apropriado | <90% |
| Tempo de detecção de emergência | <2s | >5s |
| Dados sensíveis expostos | 0 | >0 |
| Guardrails violados | <1% | >5% |

## Padrões de Comportamento

### ✅ O Agente PODE
- Sugerir agendamento
- Fornecer informações sobre serviços
- Dizer que não sabe algo
- Pedir esclarecimentos
- Fazer handoff quando apropriado

### ❌ O Agente NÃO PODE
- Dar diagnósticos médicos
- Prescrever medicamentos
- Expor informações sensíveis
- Garantir resultados de tratamentos
- Ignorar emergências
