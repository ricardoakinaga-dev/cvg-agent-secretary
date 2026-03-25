# 00 - Visão do Produto

## Visão do Produto

O **CVG Secretary Agent** é um assistente virtual inteligente desenvolvido para atuar como secretária automatizada de um hospital veterinário, oferecendo atendimento ao cliente via Chatwoot com competência, empatia e segurança. O agente utiliza processamento de linguagem natural via OpenAI para compreender intenções, responder de forma contextualizada e executar tarefas operacionais, tudo isso mantendo memória persistente sobre clientes e seus animais de estimação.

## Problema que Resolve

Hospitais veterinários enfrentam volume crescente de atendimentos via chat, resultando em:

- **Tempo de espera elevado**: Clientes aguardando atendimento humano para dúvidas simples como horários, agendamentos e orientações de preparo
- **Inconsistência de informações**: Respostas variáveis entre diferentes atendentes humanos sobre políticas, procedimentos e serviços
- **Perda de contexto**: Falta de memória de interações anteriores com o cliente, exigindo repetição de informações a cada contato
- **Sobrecarga operacional**: Equipe humana sobrecarregada com tarefas repetitivas que poderiam ser automatizadas
- **Atendimento fora do horário**: Inexistência de atendimento 24/7 para dúvidas urgentes fora do horário comercial
- **Fragmentação de dados**: Informações de clientes e pets dispersas em múltiplos sistemas sem integração

## Missão da Secretária Virtual

Proporcionar aos clientes do hospital veterinário uma experiência de atendimento cordial, eficiente e personalizada, disponível 24 horas por dia, 7 dias por semana, coletando e persistindo informações relevantes sobre clientes e pets para melhorar continuamente a qualidade do serviço e preparar o terreno para automação de agendamentos e outras operações futuras.

## Escopo Inicial (MVP)

| Funcionalidade | Descrição |
|----------------|-----------|
| **Atendimento via Chatwoot** | Receber e responder mensagens do Chatwoot |
| **Cadastro de clientes** | Coletar e armazenar dados de clientes (nome, telefone, email, endereço) |
| **Cadastro de pets** | Registrar informações de pets (nome, espécie, raça, idade, tutor) |
| **Consulta de memória** | Recuperar histórico de interações e dados previamente armazenados |
| **Base de conhecimento** | Responder dúvidas sobre serviços, horários, políticas, FAQ |
| **Encaminhamento humano** | Detectar situações que requerem intervenção humana e fazer handoff |
| **Auditoria completa** | Registrar todas as interações para conformidade e melhoria |

## Escopo Futuro

| Funcionalidade | Descrição |
|----------------|-----------|
| **Agendamento automatizado** | Agendar consultas e procedimentos via agente |
| **Lembretes proativos** | Enviar lembretes de consultas, vacinações e medicamentos |
| **Multiunidade** | Suporte a múltiplos hospitais/unidades |
| **Multi-canal** | Integração com WhatsApp, Instagram, Facebook |
| **Pagamentos** | Processamento de pagamentos de serviços |
| **Telemedicina** | Suporte a consultas remotas |
| **App próprio** | Aplicativo móvel para tutores |
| **Relatórios analytics** | Dashboard de métricas de atendimento |

## Princípios do Sistema

### Princípios Arquiteturais

1. **Separação de responsabilidades**: Runtime de processamento separado de workers de ingestão e observabilidade
2. **Stateless runtime**: Estado de conversation armazenado em Redis, não em memória do processo
3. **Event-driven**: Comunicação assíncrona entre componentes via filas Redis
4. **Defense in depth**: Múltiplas camadas de segurança e validação
5. **Observabilidade total**: Cada operação gera logs estruturados com correlação

### Princípios de Produto

1. **Empatia primeiro**: Toda interação deve demonstrar cuidado genuíno com o pet e o tutor
2. **Segurança clínica**: Nunca fornecer recomendações médicas, sempre direcionar ao veterinário
3. **Transparência**: Cliente deve saber quando está falando com agente vs. humano
4. **Privacidade**: Dados de clientes protegidos conforme LGPD
5. **Melhoria contínua**: Sistema aprende com interações e feedback humano

## Limites Clínicos

O agente **NUNCA** deve:

- Diagnosticar condições de saúde em pets
- Prescrever medicamentos ou tratamentos
- Interpretar resultados de exames laboratoriais
- Sugerir procedimentos cirúrgicos ou invasivos
- Fazer afirmações sobre prognóstico
- Substituir consulta veterinária presencial
- Recomendar troca de tratamento sem autorização do médico veterinário

**Ação correta**: Em situações que envolvam saúde do pet, o agente deve:
- Demonstrar empatia e interesse genuíno
- Orientar que apenas um médico veterinário pode avaliar adequadamente
- Oferecer agendamento de consulta
- Em casos de emergência, direcionar para atendimento urgente imediato
- Nunca minimizar preocupações do tutor

## Limites Operacionais

O agente **NÃO deve** inicialmente:

- Processar pagamentos (futuro)
- Acessar histórico médico de pets (futuro)
- Alterar agendamentos confirmados (futuro)
- Cancelar procedimentos com financeiro envolvido sem supervisão humana
- Emitir notas fiscais ou recibos
- Acessar sistemas internos de gestão hospitalar
- Modificar preços ou políticas sem aprovação

## Metas do MVP

### Metas Quantitativas

| Métrica | Meta |
|---------|------|
| Taxa de automação | ≥ 60% das interações resolvidas sem handoff |
| Tempo médio de resposta | ≤ 30 segundos |
| Satisfação estimada | ≥ 4.0/5.0 (medido indiretamente) |
| Precisão de extração de dados | ≥ 90% (validação posterior) |
| Uptime | ≥ 99.5% |

### Metas Qualitativas

- Respostas consistentes com base de conhecimento
- Memória persistente funcionando corretamente
- Handoff fluido e bem documentado
- Logs completos para auditoria
- Base de conhecimento fácil de atualizar
- Integração Telegram funcionando para alimentação de conhecimento

## Metas de Longo Prazo

| Horizonte | Meta |
|-----------|------|
| **6 meses** | Agendamento automatizado funcional, múltiplas unidades |
| **12 meses** | Omni-channel, processamento de pagamentos |
| **18 meses** | Analytics avançado, predição de necessidades |
| **24 meses** | Interface de voz, integração com sistemas hospitalares |

## Definições de Sucesso do MVP

O MVP será considerado bem-sucedido quando:

1. ✅ Agente responde corretamente a perguntas frequentes sobre serviços e horários
2. ✅ Cliente consegue agendar consulta (mesmo que com validação humana)
3. ✅ Dados de clientes e pets são persistidos corretamente
4. ✅ Memória é recuperada em conversas subsequentes
5. ✅ Handoff é acionado corretamente em situações críticas
6. ✅ Base de conhecimento pode ser atualizada via Telegram
7. ✅ Todos os logs estão acessíveis e correlacionáveis
8. ✅ Sistema escala horizontalmente sem perda de estado
