# 14 - Roadmap

## Visão Geral

Este documento apresenta o roadmap de evolução do CVG Secretary Agent, organizado em fases progressivas, do MVP até funcionalidades avançadas.

---

## Fase 1: MVP (Mês 1-2)

### Objetivo

Ter o agente funcionando em produção com funcionalidades básicas de atendimento.

### Escopo

| Funcionalidade | Descrição | Prioridade |
|----------------|-----------|------------|
| **Atendimento Chatwoot** | Receber e responder mensagens | Crítica |
| **Cadastro de clientes** | Coletar e salvar dados de tutores | Crítica |
| **Cadastro de pets** | Coletar e salvar dados de pets | Crítica |
| **Base de conhecimento** | FAQ, horários, políticas | Crítica |
| **Handoff básico** | Transferência para humano | Crítica |
| **Memória simples** | Salvar facts básicos | Alta |
| **Logs e auditoria** | Rastreabilidade completa | Alta |

### Entregáveis

- [ ] API do agente em produção
- [ ] Integração Chatwoot funcionando
- [ ] Base de conhecimento inicial (50+ documentos)
- [ ] Dashboard de monitoramento
- [ ] Fluxo de handoff documentado

### Critérios de Sucesso

- ✅ Agente responde a mensagens automaticamente
- ✅ Taxa de automação ≥ 60%
- ✅ Tempo de resposta < 30s

---

## Fase 2: Evolução Operacional (Mês 3-4)

### Objetivo

Melhorar a eficácia operacional e reduzir handoffs desnecessários.

### Escopo

| Funcionalidade | Descrição | Prioridade |
|----------------|-----------|------------|
| **Agendamento simples** | Agendar consultas com validação humana | Alta |
| **Melhoria de intent** | Classificador mais preciso | Alta |
| **Confirmação de dados** | Validar dados coletados | Média |
| **Follow-up tasks** | Criar lembretes | Média |
| **Notificações internas** | Alertas para setores | Média |

### Entregáveis

- [ ] Fluxo de agendamento com humano validando
- [ ] Classifier treinado com dados reais
- [ ] Sistema de follow-up operacional
- [ ] Notificações por setor

---

## Fase 3: Evolução de Memória (Mês 5-6)

### Objetivo

Tornar a memória mais inteligente e personalizada.

### Escopo

| Funcionalidade | Descrição | Prioridade |
|----------------|-----------|------------|
| **Memória por sessão** | Contexto completo de conversa | Alta |
| **Preferências aprendidas** | Canal preferido, horário, etc | Alta |
| **Histórico estruturado** | Todas as interações | Alta |
| **Extração automática** | Facts sem confirmação | Média |
| **Confiança adaptativa** | Score dinâmico | Média |

### Entregáveis

- [ ] Memória persistente completa
- [ ] Histórico pesquisável
- [ ] Recuperação de contexto entre sessões

---

## Fase 4: Evolução de Integração (Mês 7-9)

### Objetivo

Expandir canais e integrações.

### Escopo

| Funcionalidade | Descrição | Prioridade |
|----------------|-----------|------------|
| **WhatsApp** | Integração direta (Twilio/Evolution) | Alta |
| **Instagram** | Respostas via Direct | Alta |
| **Facebook** | Messenger integration | Média |
| **Agendamento full** | Automático sem validação humana | Alta |
| **Lembretes proativos** | SMS/WhatsApp de lembrete | Alta |

### Entregáveis

- [ ] Omni-channel (3+ canais)
- [ ] Agendamento 100% automático
- [ ] Sistema de lembretes

---

## Fase 5: Multiunidade / Multihospital (Mês 10-12)

### Objetivo

Suportar múltiplas unidades/hospitais.

### Escopo

| Funcionalidade | Descrição | Prioridade |
|----------------|-----------|------------|
| **Multi-unidade** | Vários hospitais com configurações | Alta |
| **Roteamento** | Direcionar por localização | Alta |
| **Políticas por unidade** | Regras específicas | Alta |
| **Relatórios consolidados** | Dashboard multi-unidade | Média |
| **Transferência entre unidades** | Encaminhar para unidade correta | Alta |

### Entregáveis

- [ ] Suporte a 2+ unidades
- [ ] Dashboard consolidado
- [ ] Roteamento inteligente

---

## Itens Fora de Escopo Imediato

### Não Prioritários no Curto Prazo

| Item | Razão |
|------|-------|
| **Pagamentos** | Requer integração com gateway/ERP |
| **Prontuário eletrônico** | Requer sistemas hospitalares |
| **Telemedicina** | Requer regulamentação |
| **Interface de voz (IVA)** | Requer tecnologia adicional |
| **App próprio** | Alto custo de desenvolvimento |
| **Chat em tempo real** | Chatwoot já cobre |
| **Analytics avançado** | Dados insuficientes no MVP |

---

## Critérios de Priorização

### Como Decidir O Que Fazer

1. **Impacto no cliente**: Melhora atendimento?
2. **Esforço**: Quanto tempo para implementar?
3. **Dependências**: Depende de algo já feito?
4. **Receita**: Gera valor direto?

### Matriz de Priorização

| | Alto Impacto | Baixo Impacto |
|---|---|---|
| **Baixo Esforço** | 🔥 FAZER AGORA | ⏳ ESPERAR |
| **Alto Esforço** | 📋 PLANEJAR | ❌ DESCARTAR |

---

## Indicadores de Progresso

### KPIs por Fase

| Fase | KPI Principal | Meta |
|------|--------------|------|
| 1 | Taxa de automação | ≥ 60% |
| 2 | Taxa de agendamento | ≥ 40% |
| 3 | Satisfação estimada | ≥ 4.2/5 |
| 4 | Multi-channel coverage | 3+ canais |
| 5 | Multi-unit revenue | 2+ unidades |

### Métricas de Desenvolvimento

| Métrica | Meta |
|---------|------|
| Velocidade de deploy | 1 feature/sprint |
| Taxa de bugs em produção | < 2% |
| Cobertura de testes | > 70% |
| Tempo de code review | < 24h |

---

## Riscos e Mitigações

### Risco 1: Baixa Adoção

| Mitigação |
|-----------|
| Treinamento da equipe |
| Campanhas de marketing |
| Onboarding guiado |

### Risco 2: Alto Custo de LLM

| Mitigação |
|-----------|
| Otimização de prompts |
| Cache de respostas |
| Modelo menor quando possível |

### Risco 3: Dependência do Chatwoot

| Mitigação |
|-----------|
| Abstrair integração |
| Suportar múltiplos canais |
| Ter fallback |

---

## Revisões do Roadmap

### Frequência

- **Mensal**: Revisão de prioridades
- **Trimestral**: Revisão de fase
- **Anual**: Planejamento estratégico

### O que Revisar

1. O que foi entregue?
2. O que está atrasado?
3. Prioridades mudaram?
4. Novas oportunidades?
5. Riscos realizados?
