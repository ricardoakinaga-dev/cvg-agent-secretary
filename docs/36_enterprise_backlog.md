# 36 - Backlog Adaptado para o Novo Momento do Programa

## Objetivo

Traduzir o novo roadmap pós-produção assistida em backlog executável para levar o sistema de **85/100** a **90/100** e preparar a base enterprise.

## Estratégia

O backlog agora deixa de ser de “resgate técnico” e passa a ser de **maturação estratégica**.

## Prioridades

### P0 - Ganho rápido para 87/88

#### 1. Zerar ou quase zerar warnings críticos de lint

**Objetivo**
- reduzir dívida técnica residual

**Critério de aceite**
- warnings restantes reduzidos ao mínimo aceitável

#### 2. Ampliar suíte oficial de testes

**Objetivo**
- aumentar confiança operacional

**Critério de aceite**
- incluir mais módulos estáveis na suíte oficial

#### 3. Validar `docker build` no CI

**Objetivo**
- provar pipeline de container de ponta a ponta

**Critério de aceite**
- workflow executa build de imagem com sucesso

#### 4. Revisar cobertura dos módulos menos confiáveis

**Objetivo**
- melhorar cobertura útil, não só métrica global

**Alvos iniciais**
- `chatwoot/client.ts`
- `chatwoot/integration.ts`
- `logging/index.ts`

## P1 - Governança e observabilidade

#### 5. Criar trilha de auditoria para eventos críticos

**Objetivo**
- auditar ações relevantes do sistema

**Eventos sugeridos**
- handoff
- publicação de conhecimento
- aprovações/rejeições
- alterações administrativas

#### 6. Melhorar dashboard operacional

**Objetivo**
- aproximar analytics da visão de gestão

**Entregas**
- taxa de resolução
- taxa de handoff
- falhas por provider
- volume por canal

#### 7. Consolidar métricas de operação supervisionada

**Objetivo**
- formalizar indicadores semanais de acompanhamento

## P2 - Segurança e compliance

#### 8. Implementar mascaramento de dados sensíveis

**Objetivo**
- reduzir exposição operacional

**Escopo**
- CPF/CNPJ
- contatos
- campos sensíveis em logs

#### 9. Revisar política de logs

**Objetivo**
- evitar excesso de dados sensíveis ou ruído operacional

#### 10. Revisar gestão de segredos e envs

**Objetivo**
- preparar o sistema para ambientes mais controlados

## P3 - Foundation enterprise

#### 11. Implementar RBAC básico

**Objetivo**
- estabelecer controle de acesso por perfil

**Escopo inicial**
- admin
- manager
- agent
- viewer

#### 12. Formalizar audit logs

**Objetivo**
- registrar ações críticas com rastreabilidade

#### 13. Definir contratos de API interna

**Objetivo**
- preparar futuras integrações sem abrir API pública ampla ainda

#### 14. Produzir blueprint de multi-tenant

**Objetivo**
- decidir estratégia de tenancy com base estável

**Saída esperada**
- documento arquitetural comparando:
  - schema per tenant
  - database per tenant
  - row-level security

## Ordem Recomendada de Execução

1. Warnings de lint
2. Mais testes
3. Docker build no CI
4. Cobertura útil nos módulos críticos
5. Trilhas de auditoria
6. Dashboard operacional ampliado
7. Métricas gerenciais
8. Mascaramento de dados
9. Política de logs
10. Gestão de segredos
11. RBAC básico
12. Audit logs formais
13. Contratos de API interna
14. Blueprint de multi-tenant

## Entregas que Mais Aumentam a Nota

### Para 87-88

- warnings residuais
- mais testes
- docker build no CI

### Para 89

- auditoria operacional
- segurança/logs
- dashboard mais maduro

### Para 90+

- RBAC
- audit logs
- API interna bem definida
- blueprint de tenancy

## Itens Fora do Foco Agora

- API pública ampla
- multi-tenant completo
- A/B testing avançado
- experimentação pesada
- Qdrant como prioridade

## Critério de Fechamento do Ciclo 90/100

Este backlog só pode ser considerado concluído quando o programa demonstrar:

- operação previsível
- visibilidade gerencial real
- segurança mais madura
- governança de acesso e auditoria
- base segura para expansão enterprise

*Backlog gerado em 25/03/2026*
