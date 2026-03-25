// Tests for Handoff Summary Generation - Phase 4

import {
  generateHandoffSummary,
  HandoffSummary,
} from '../../src/modules/chatwoot/integration';

describe('Handoff Summary Generation', () => {
  const baseSummary: HandoffSummary = {
    contactName: 'Maria Santos',
    petName: 'Buddy',
    conversationHistory: [
      'Cliente: Olá! Gostaria de agendar banho no meu cachorro',
      'Agente: Olá Maria! Que bom falar com você! Para agendar, preciso saber o nome do pet e qual serviço deseja.',
      'Cliente: É o Buddy,昨天 ele fez banho aqui e não gostei porque ficou esperando demais',
      'Agente: Entendo sua preocupação. Vou registrar seu feedback. Gostaria de agendar o banho mesmo assim?',
      'Cliente: Quero falar com responsável sobre isso',
    ],
    whatClientWanted:
      'Cliente quer agendar banho e tosa para o Buddy, mas está insatisfeita com o último atendimento (pet ficou muito tempo esperando).',
    informationCollected: {
      pet: 'Buddy (cachorro)',
      tutor: 'Maria Santos',
      servico: 'banho e tosa',
    },
    handoffReason:
      'Cliente insatisfeita com atendimento anterior e pedindo responsável. Conflito que requer intervenção humana.',
    pendingQuestions: [
      'Cliente quer reclamar formalmente?',
      'Deseja agendar banho mesmo assim?',
      'Quer desconto ou crédito para próxima vez?',
    ],
    whatWasAnswered: [
      'Empatia e pedido de desculpas',
      'Oferecimento de agendamento',
    ],
  };

  it('should generate summary with contact name', () => {
    const result = generateHandoffSummary(baseSummary);
    expect(result).toContain('Maria Santos');
  });

  it('should include pet name', () => {
    const result = generateHandoffSummary(baseSummary);
    expect(result).toContain('Buddy');
  });

  it('should include what client wanted', () => {
    const result = generateHandoffSummary(baseSummary);
    expect(result).toContain('O QUE O CLIENTE QUERIA');
    expect(result).toContain('agendar');
  });

  it('should include conversation history', () => {
    const result = generateHandoffSummary(baseSummary);
    expect(result).toContain('HISTÓRICO DA CONVERSA');
  });

  it('should include information collected', () => {
    const result = generateHandoffSummary(baseSummary);
    expect(result).toContain('INFORMAÇÕES COLETADAS');
    expect(result).toContain('Buddy (cachorro)');
  });

  it('should include handoff reason', () => {
    const result = generateHandoffSummary(baseSummary);
    expect(result).toContain('MOTIVO DA TRANSFERÊNCIA');
    expect(result).toContain('insatisfeita');
  });

  it('should include pending questions', () => {
    const result = generateHandoffSummary(baseSummary);
    expect(result).toContain('PERGUNTAS PENDENTES');
    expect(result).toContain('reclamar formalmente');
  });

  it('should include what was answered', () => {
    const result = generateHandoffSummary(baseSummary);
    expect(result).toContain('JÁ TENTAMOS/RESPONDEMOS');
  });

  it('should work without pet name', () => {
    const summaryWithoutPet: HandoffSummary = {
      ...baseSummary,
      petName: undefined,
    };
    const result = generateHandoffSummary(summaryWithoutPet);
    expect(result).toContain('Maria Santos');
    expect(result).not.toContain('🐾 **Pet:**');
  });

  it('should work without pending questions', () => {
    const summaryWithoutPending: HandoffSummary = {
      ...baseSummary,
      pendingQuestions: [],
    };
    const result = generateHandoffSummary(summaryWithoutPending);
    expect(result).not.toContain('PERGUNTAS PENDENTES');
  });

  it('should format with emojis', () => {
    const result = generateHandoffSummary(baseSummary);
    expect(result).toContain('📋');
    expect(result).toContain('👤');
    expect(result).toContain('🐾');
    expect(result).toContain('📝');
  });
});
