# 38 - Blueprint de Multi-Tenant

## Objetivo

Definir a estratégia de tenancy mais adequada para o programa, considerando a base técnica atual e os requisitos enterprise.

## Contexto Atual

O projeto está em **87/100** de maturidade técnica com:
- Analytics persistido
- RBAC básico implementado
- Audit logs formalizados
- Contratos de API interna definidos
- Observabilidade operacional

## Estratégias de Tenancy Avaliadas

### 1. Schema Per Tenant

**Descrição**: Cada tenant tem seu próprio schema no mesmo banco de dados.

**Vantagens**:
- Isolamento lógico forte
- Facilita backups/restores por tenant
- Permite customização por tenant
- Query performance previsível

**Desvantagens**:
- Migrações complexas (N schemas)
- Maior overhead de manutenção
- Conexões podem se multiplicar
- Código mais complexo para gerenciar schemas

**Adequação ao projeto**:
- ❌ Alta complexidade para o momento
- ❌ Requer refatoração significativa

### 2. Database Per Tenant

**Descrição**: Cada tenant tem seu próprio banco de dados.

**Vantagens**:
- Isolamento físico completo
- Conformidade regulatória facilitada
- Backup/restore independente
- Performance isolada

**Desvantagens**:
- Custo elevado de infraestrutura
- Gestão complexa de conexões
- Migrações muito complexas
- Monitoramento fragmentado

**Adequação ao projeto**:
- ❌ Muito custoso para fase atual
- ❌ Complexidade operacional alta

### 3. Row-Level Security (RLS)

**Descrição**: Todos os tenants compartilham tabelas, com políticas de隔离 no nível de linha.

**Vantagens**:
- Menor complexidade de código
- Migrações centralizadas
- Custo de infraestrutura menor
- Escalabilidade horizontal mais simples

**Desvantagens**:
- Isolamento menos forte
- Performance pode variar entre tenants
- Requer políticas RLS bem definidas
- Risco de vazamento se políticas falharem

**Adequação ao projeto**:
- ✅ Menor impacto no código atual
- ✅ Evolução incremental possível
- ✅ Custo controlado

## Recomendação

### Estratégia sugerida: Row-Level Security (RLS)

**Justificativa**:

1. **Menor impacto no código existente**
   - Adição de `tenant_id` nas tabelas
   - Políticas RLS no PostgreSQL
   - Middleware para setar contexto de tenant

2. **Evolução incremental**
   - Fase 1: Adicionar `tenant_id` e políticas básicas
   - Fase 2: Implementar isolamento completo
   - Fase 3: Otimização por tenant

3. **Custo controlado**
   - Mesmo banco de dados
   - Conexões compartilhadas
   - Migrações centralizadas

4. **Base sólida para crescimento**
   - RBAC já implementado
   - Audit logs prontos
   - Contratos de API definidos

## Plano de Implementação Sugerido

### Fase 1 - Preparação (futuro)

1. Adicionar `tenant_id` como coluna em tabelas principais
2. Criar tabela `tenants` com metadados
3. Atualizar queries para incluir `tenant_id`

### Fase 2 - Isolamento (futuro)

1. Implementar políticas RLS no PostgreSQL
2. Criar middleware para setar contexto de tenant
3. Atualizar RBAC para considerar tenant

### Fase 3 - Otimização (futuro)

1. Implementar connection pooling por tenant
2. Criar índices otimizados por tenant
3. Implementar rate limiting por tenant

## Premissas

1. **Não implementar agora**: Este blueprint é apenas documentacional
2. **Validar antes de implementar**: Testar RLS com carga real
3. **Manter compatibilidade**: Garantir que código atual funcione sem tenant

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Vazamento de dados entre tenants | Políticas RLS rigorosas e testes |
| Performance degradada | Índices adequados e monitoramento |
| Complexidade de migração | Scripts automatizados |

## Conclusão

A estratégia de **Row-Level Security** é a mais adequada para o momento do projeto, oferecendo:
- Evolução incremental
- Menor impacto no código atual
- Custo controlado
- Base sólida para crescimento enterprise

*Documento gerado em 25/03/2026*
