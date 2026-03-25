// Tests for Telegram Content Classifier
// Phase 5: Classification tests

import { classifierService } from '../../src/modules/telegram-ingestion/classifier';

describe('ClassifierService', () => {
  describe('classify', () => {
    it('should classify FAQ content', () => {
      const content = `P: Qual o horário de funcionamento?
R: Funcionamos de segunda a sexta das 7h às 19h.`;

      const result = classifierService.classify(content);

      expect(result.type).toBe('faq');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify policy content', () => {
      const content = `POLÍTICA: Cancelamento

Clientes podem cancelar até 24h antes do agendamento sem custo.`;

      const result = classifierService.classify(content);

      expect(result.type).toBe('policy');
    });

    it('should classify procedure content with numbered steps', () => {
      const content = `PROCEDIMENTO: Preparo para cirurgia

1. Jejum de 12 horas
2. Chegar 30 minutos antes
3. Trazer documentos`;

      const result = classifierService.classify(content);

      expect(result.type).toBe('procedure');
    });

    it('should classify rule content', () => {
      const content = `REGRA: Pets devem ser vacinados

- Vacinação em dia é obrigatória
- Apresentar carteirinha na consulta`;

      const result = classifierService.classify(content);

      expect(result.type).toBe('rule');
    });

    it('should classify command content', () => {
      const content = '/status';

      const result = classifierService.classify(content);

      expect(result.type).toBe('command');
      expect(result.confidence).toBe(1.0);
    });

    it('should classify schedule content', () => {
      const content = `HORÁRIO DE FUNCIONAMENTO:
Segunda a sexta: 7h às 19h
Sábado: 8h às 14h`;

      const result = classifierService.classify(content);

      expect(result.type).toBe('schedule');
    });

    it('should classify price content', () => {
      const content = `PREÇOS:
Banho: R$ 80,00
Tosa: R$ 60,00
Vacinação: R$ 120,00`;

      const result = classifierService.classify(content);

      expect(result.type).toBe('price');
    });

    it('should extract title from content', () => {
      const content = `POLÍTICA: Política de Cancelamento

Esta é a política completa de cancelamento.`;

      const result = classifierService.classify(content);

      expect(result.title).toContain('Cancelamento');
    });

    it('should use provided title when available', () => {
      const content = 'Some content here';
      
      const result = classifierService.classify(content, 'Custom Title');

      expect(result.title).toBe('Custom Title');
    });

    it('should extract tags from content', () => {
      const content = `FAQ sobre emergência:
P: Vocês atendem emergência?
R: Sim, temos plantão 24h.`;

      const result = classifierService.classify(content);

      expect(result.tags).toContain('faq');
      expect(result.tags).toContain('emergência');
    });
  });

  describe('validate', () => {
    it('should accept valid content', () => {
      const content = 'A'.repeat(100); // 100 characters

      const result = classifierService.validate(content);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject content too short', () => {
      const content = 'Short';

      const result = classifierService.validate(content);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('too short');
    });

    it('should warn about content too long', () => {
      const content = 'A'.repeat(60000); // 60000 characters

      const result = classifierService.validate(content);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('too long');
    });

    it('should reject content with script tags', () => {
      const content = '<script>alert("xss")</script>';

      const result = classifierService.validate(content);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('script injection');
    });

    it('should warn about URLs', () => {
      const content = 'Check https://example.com for more info';

      const result = classifierService.validate(content);

      expect(result.warnings).toContainEqual(
        expect.stringContaining('URL')
      );
    });
  });

  describe('getRouting', () => {
    it('should route FAQ to RAG with approval required', () => {
      const routing = classifierService.getRouting('faq');

      expect(routing.destination).toBe('rag');
      expect(routing.targetTable).toBe('knowledge_documents');
      expect(routing.requiresApproval).toBe(true);
    });

    it('should route policy to both RAG and Postgres', () => {
      const routing = classifierService.getRouting('policy');

      expect(routing.destination).toBe('both');
      expect(routing.requiresApproval).toBe(true);
    });

    it('should route rule to Postgres', () => {
      const routing = classifierService.getRouting('rule');

      expect(routing.destination).toBe('postgres');
      expect(routing.targetTable).toBe('operational_rules');
    });

    it('should reject commands', () => {
      const routing = classifierService.getRouting('command');

      expect(routing.destination).toBe('rejected');
    });

    it('should route price to Postgres', () => {
      const routing = classifierService.getRouting('price');

      expect(routing.destination).toBe('postgres');
      expect(routing.targetTable).toBe('prices');
    });
  });
});
