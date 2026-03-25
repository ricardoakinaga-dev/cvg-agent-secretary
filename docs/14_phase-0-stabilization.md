# 14 - Fase 0: Estabilização

## Objective

A Fase 0 tem como objetivo principal corrigir os bugs críticos identificados na auditoria, resolver erros de TypeScript, e preparar o código para as próximas fases de desenvolvimento.

## Scope

### In Scope
- Correção de bugs críticos do classificador
- Resolução de TypeScript errors
- Remoção de tipos `any`
- Implementação básica de validação de input
- Configuração de monitoring básico

### Out of Scope
- Novas funcionalidades
- Refatoração significativa
- Testes unitários (Fase 1)
- CI/CD (Fase 1)

## Detailed Tasks

### 14.1 - Corrigir Regex de Emergências

**Arquivo:** `src/modules/intent/classifier.ts`  
**Linha:** 51  
**Severidade:** CRÍTICA

#### Problema
```typescript
// ERRADO
pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:não\s+)?(?:consegue|movement|mover)\s+andar/i
```

#### Solução
```typescript
// CORRETO
pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:não\s+)?(?:consegue|mover|levantar)\s+andar/i
```

#### Validação
- [ ] Regex corrigido
- [ ] Teste unitário adicionado
- [ ] Emergencial detectada corretamente

---

### 14.2 - Corrigir TypeScript Errors

**Total de errors:** 8

#### Errors em `src/app.ts`
| Linha | Erro | Solução |
|-------|------|---------|
| 28 | Type string[] not assignable to string | Usar primeiro elemento do array |

#### Errors em `src/modules/chatwoot/client.ts`
| Linha | Erro | Solução |
|-------|------|---------|
| 44 | Type unknown not assignable to T | Adicionar type assertion |
| 54,70,71,77,94,114,137 | Type number not assignable to string | Converter para string |

#### Errors em `src/shared/redis.ts`
| Linha | Erro | Solução |
|-------|------|---------|
| 15 | Redis only refers to type | Importar corretamente |
| 17 | Parameter implicit any | Tipar explicitamente |

#### Validação
- [ ] npm run typecheck passa sem erros
- [ ] Build completa com sucesso

---

### 14.3 - Remover Uso de `any`

**Arquivo:** `src/modules/runtime/agentRuntime.ts`  
**Linha:** 144

```typescript
// ANTES
(context as any).contactId = memoryContext.contactId;

// DEPOIS (criar interface correta)
interface ConversationContextWithContact extends ConversationContext {
  contactId?: string;
}

const contextWithContact = context as ConversationContextWithContact;
contextWithContact.contactId = memoryContext.contactId;
```

#### Validação
- [ ] Zero ocorrências de `as any`
- [ ] TypeScript strict mode ativado

---

### 14.4 - Implementar Validação de Input

#### Biblioteca Recomendada
- **Zod** - Schema validation

#### Instalação
```bash
npm install zod
```

#### Exemplo de Schema
```typescript
// src/modules/contacts/types.ts
import { z } from 'zod';

export const ContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  chatwootId: z.number().optional(),
});

export type CreateContactInput = z.infer<typeof ContactSchema>;
```

#### Validação
- [ ] Zod instalado
- [ ] Schemas definidos para inputs principais
- [ ] Validação aplicada em repositories

---

### 14.5 - Monitoring Básico

#### Tasks
- [ ] Health check endpoint funcional
- [ ] Logging de erros estruturado
- [ ] Correlation IDs em todas requisições

## Affected Files

- `src/modules/intent/classifier.ts` - Bug regex
- `src/modules/runtime/agentRuntime.ts` - Remover any
- `src/modules/chatwoot/client.ts` - TypeScript errors
- `src/shared/redis.ts` - TypeScript errors
- `src/app.ts` - TypeScript errors

## Validation Checkpoints

- [ ] Todos os bugs críticos corrigidos
- [ ] 0 TypeScript errors
- [ ] 0 uso de `any`
- [ ] Validação de input básica
- [ ] Health checks funcionais
- [ ] npm run build passa

## Critérios de Conclusão da Fase

1. ✅ Codebase compilando sem erros
2. ✅ Bugs críticos resolvidos
3. ✅ Validação básica implementada
4. ✅ Pronto para Fase 1

## Estimativa de Esforço

| Tarefa | Estimativa |
|--------|------------|
| Corrigir regex | 1h |
| Corrigir TS errors | 4h |
| Remover any | 2h |
| Validar input | 8h |
| Testing | 4h |
| **Total** | **~19h** |
