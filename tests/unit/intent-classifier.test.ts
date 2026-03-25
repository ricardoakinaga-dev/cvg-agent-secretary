import { describe, it, expect, beforeEach } from 'vitest';
import { classifyIntent, getRecommendedAction } from '../../src/modules/intent/classifier';

describe('Intent Classifier', () => {
  describe('classifyIntent', () => {
    it('should detect emergency - breathing difficulty', () => {
      const result = classifyIntent('meu pet não consegue respirar');
      
      expect(result.intent).toBe('possivel_urgencia');
      expect(result.requiresHandoff).toBe(true);
      expect(result.riskLevel).toBe('high');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should detect emergency - poisoning', () => {
      const result = classifyIntent('meu cachorro comeu veneno');
      
      expect(result.intent).toBe('possivel_urgencia');
      expect(result.requiresHandoff).toBe(true);
      expect(result.handoffReason).toContain('envenenamento');
    });

    it('should detect emergency - cannot walk', () => {
      const result = classifyIntent('meu pet não consegue andar');
      
      expect(result.intent).toBe('possivel_urgencia');
      expect(result.requiresHandoff).toBe(true);
      expect(result.riskLevel).toBe('high');
    });

    it('should detect human request', () => {
      const result = classifyIntent('quero falar com um humano');
      
      expect(result.intent).toBe('pedido_humano');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should detect complaint', () => {
      const result = classifyIntent('isso é um absurdo, quero falar com o gerente');
      
      expect(result.intent).toBe('reclamacao');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should detect financial sensitive', () => {
      const result = classifyIntent('não tenho como pagar');
      
      expect(result.intent).toBe('financeiro_sensivel');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should detect greeting', () => {
      const result = classifyIntent('oi bom dia');
      
      expect(result.intent).toBe('saudacao');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect hours inquiry', () => {
      const result = classifyIntent('qual o horário de funcionamento?');
      
      expect(result.intent).toBe('horarios');
      expect(result.detectedKeywords).toContain('horarios');
    });

    it('should detect service inquiry', () => {
      const result = classifyIntent('quais serviços vocês oferecem?');
      
      expect(result.intent).toBe('servicos');
    });

    it('should detect price inquiry', () => {
      const result = classifyIntent('quanto custa o banho?');
      
      expect(result.intent).toMatch(/(?:precos|servicos)/);
    });

    it('should detect scheduling', () => {
      const result = classifyIntent('queria marcar uma consulta');
      
      expect(result.intent).toMatch(/(?:agendamento|servicos)/);
    });

    it('should detect cancellation', () => {
      const result = classifyIntent('preciso cancelar o agendamento');
      
      expect(result.intent).toMatch(/(?:cancelamento|agendamento)/);
    });

    it('should detect clinical question', () => {
      const result = classifyIntent('meu pet está tossindo muito');
      
      expect(result.intent).toBe('duvida_clinica');
    });

    it('should extract phone number from message', () => {
      const result = classifyIntent('meu pet está doente, liga no 11999999999');
      
      expect(result.entities.phone).toBeDefined();
      expect(result.entities.phone).toContain('11999999999');
    });

    it('should extract email from message', () => {
      const result = classifyIntent('meu email é teste@email.com');
      
      expect(result.entities.email).toBeDefined();
      expect(result.entities.email).toContain('teste@email.com');
    });
  });

  describe('getRecommendedAction', () => {
    it('should return urgent tone for emergency', () => {
      const classification = classifyIntent('meu pet não consegue respirar');
      const action = getRecommendedAction(classification);
      
      expect(action.responseTone).toBe('urgent');
      expect(action.shouldRespond).toBe(true);
    });

    it('should return empathetic tone for complaint', () => {
      const classification = classifyIntent('estou muito insatisfeito');
      const action = getRecommendedAction(classification);
      
      expect(action.responseTone).toBe('empathetic');
    });

    it('should use knowledge for service inquiry', () => {
      const classification = classifyIntent('quais serviçosvocês oferecem?');
      const action = getRecommendedAction(classification);
      
      expect(action.shouldUseKnowledge).toBe(true);
    });
  });
});
