// Tests for Intent Classifier - Phase 4

import { classifyIntent, getRecommendedAction } from '../../src/modules/intent/classifier';

describe('Intent Classifier', () => {
  describe('Urgency detection', () => {
    it('should detect breathing emergency', () => {
      const result = classifyIntent('Meu pet não consegue respirar');
      expect(result.intent).toBe('possivel_urgencia');
      expect(result.requiresHandoff).toBe(true);
      expect(result.riskLevel).toBe('high');
    });

    it('should detect poisoning emergency', () => {
      const result = classifyIntent('Meu cachorro comeu veneno');
      expect(result.intent).toBe('possivel_urgencia');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should detect seizure emergency', () => {
      const result = classifyIntent('Meu gato teve convulsão');
      expect(result.intent).toBe('possivel_urgencia');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should detect bleeding emergency', () => {
      const result = classifyIntent('Meu pet está sangrando muito');
      expect(result.intent).toBe('possivel_urgencia');
      expect(result.requiresHandoff).toBe(true);
    });
  });

  describe('Complaint detection', () => {
    it('should detect request for responsible person', () => {
      const result = classifyIntent('Quero falar com o responsável');
      expect(result.intent).toBe('reclamacao');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should detect complaint with strong language', () => {
      const result = classifyIntent('Isso é um absurdo');
      expect(result.intent).toBe('reclamacao');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should detect threat to seek authorities', () => {
      const result = classifyIntent('Vou procurar os órgãos de defesa');
      expect(result.intent).toBe('reclamacao');
      expect(result.requiresHandoff).toBe(true);
    });
  });

  describe('Financial sensitivity', () => {
    it('should detect inability to pay', () => {
      const result = classifyIntent('Não tenho como pagar');
      expect(result.intent).toBe('financeiro_sensivel');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should detect refund request', () => {
      const result = classifyIntent('Quero solicitar reembolso');
      expect(result.intent).toBe('financeiro_sensivel');
      expect(result.requiresHandoff).toBe(true);
    });
  });

  describe('Human request detection', () => {
    it('should detect explicit human request', () => {
      const result = classifyIntent('Quero falar com um humano');
      expect(result.intent).toBe('pedido_humano');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should detect request for attendant', () => {
      const result = classifyIntent('Pode chamar um atendente?');
      expect(result.intent).toBe('pedido_humano');
      expect(result.requiresHandoff).toBe(true);
    });
  });

  describe('Greeting detection', () => {
    it('should detect simple greeting', () => {
      const result = classifyIntent('Olá');
      expect(result.intent).toBe('saudacao');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect good morning', () => {
      const result = classifyIntent('Bom dia!');
      expect(result.intent).toBe('saudacao');
    });

    it('should detect how are you', () => {
      const result = classifyIntent('Tudo bem?');
      expect(result.intent).toBe('saudacao');
    });
  });

  describe('Hours inquiry', () => {
    it('should detect hours question', () => {
      const result = classifyIntent('Qual o horário de atendimento?');
      expect(result.intent).toBe('horarios');
    });

    it('should detect closing time question', () => {
      const result = classifyIntent('Que horas vocês fecham?');
      expect(result.intent).toBe('horarios');
    });
  });

  describe('Service inquiry', () => {
    it('should detect service question', () => {
      const result = classifyIntent('Quais serviços vocês oferecem?');
      expect(result.intent).toBe('servicos');
    });

    it('should detect specific service inquiry', () => {
      const result = classifyIntent('Vocês fazem banho e tosa?');
      expect(result.intent).toBe('servicos');
    });
  });

  describe('Price inquiry', () => {
    it('should detect price question', () => {
      const result = classifyIntent('Quanto custa a consulta?');
      expect(result.intent).toBe('precos');
    });

    it('should detect budget request', () => {
      const result = classifyIntent('Preciso de um orçamento');
      expect(result.intent).toBe('precos');
    });
  });

  describe('Scheduling', () => {
    it('should detect scheduling request', () => {
      const result = classifyIntent('Quero agendar uma consulta');
      expect(result.intent).toBe('agendamento');
    });

    it('should detect scheduling with date', () => {
      const result = classifyIntent('Tem horário para sexta-feira?');
      expect(result.intent).toBe('agendamento');
    });
  });

  describe('Cancellation', () => {
    it('should detect cancellation request', () => {
      const result = classifyIntent('Quero cancelar o agendamento');
      expect(result.intent).toBe('cancelamento');
    });
  });

  describe('Clinical questions', () => {
    it('should detect clinical question', () => {
      const result = classifyIntent('Meu pet está tossindo muito');
      expect(result.intent).toBe('duvida_clinica');
    });

    it('should not require handoff for clinical question initially', () => {
      const result = classifyIntent('O que pode ser que meu gato está mancando?');
      expect(result.intent).toBe('duvida_clinica');
      expect(result.requiresHandoff).toBe(false);
    });
  });

  describe('Entity extraction', () => {
    it('should extract phone number', () => {
      const result = classifyIntent('Meu telefone é 11999999999');
      expect(result.entities.phone).toBeDefined();
    });

    it('should extract pet name', () => {
      const result = classifyIntent('Meu cachorro Buddy está doente');
      expect(result.entities.petName).toBe('Buddy');
    });

    it('should extract pet species', () => {
      const result = classifyIntent('Meu gato está doente');
      expect(result.entities.petSpecies).toBe('gato');
    });

    it('should extract service type', () => {
      const result = classifyIntent('Quero banho e tosa');
      expect(result.entities.serviceType).toBe('banho');
    });
  });
});

describe('Recommended Action', () => {
  it('should return urgent tone for urgency', () => {
    const classification = classifyIntent('Meu pet não consegue respirar');
    const action = getRecommendedAction(classification);
    expect(action.responseTone).toBe('urgent');
  });

  it('should return empathetic tone for complaint', () => {
    const classification = classifyIntent('Quero falar com o responsável');
    const action = getRecommendedAction(classification);
    expect(action.responseTone).toBe('empathetic');
  });

  it('should return informative tone for hours', () => {
    const classification = classifyIntent('Qual o horário?');
    const action = getRecommendedAction(classification);
    expect(action.responseTone).toBe('informative');
  });
});
