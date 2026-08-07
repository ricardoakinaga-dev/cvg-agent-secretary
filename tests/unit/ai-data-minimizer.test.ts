import { minimizeProviderInput } from '../../src/modules/security/ai-data-minimizer';

describe('AI provider data minimizer', () => {
  it('pseudonymizes known people and pets while excluding private memory and identifiers', () => {
    const minimized = minimizeProviderInput(
      {
        conversationId: 'conversation-secret',
        contactId: 'contact-secret',
        contactName: 'Maria Silva',
        conversationHistory: [
          'Maria falou sobre Buddy pelo e-mail maria@example.com.',
        ],
        memories: ['MEMORIA BRUTA: Maria prefere atendimento aos sabados.'],
        pets: [
          {
            id: 'pet-secret',
            name: 'Buddy',
            species: 'cachorro',
            breed: 'Golden Retriever',
          },
        ],
        knowledge: [],
        schedulingState: {
          stage: 'waiting_slot_confirmation',
          appointmentId: 'appointment-secret',
        },
        contactIntake: {
          contactRole: 'tutor',
          contactReason: 'Preciso saber sobre consulta; telefone (11) 99999-8888',
        },
      },
      'Maria quer confirmar Buddy com CPF 123.456.789-01.'
    );

    const serialized = JSON.stringify(minimized);
    expect(serialized).not.toContain('Maria');
    expect(serialized).not.toContain('Silva');
    expect(serialized).not.toContain('Buddy');
    expect(serialized).not.toContain('maria@example.com');
    expect(serialized).not.toContain('123.456.789-01');
    expect(serialized).not.toContain('MEMORIA BRUTA');
    expect(serialized).not.toContain('pet-secret');
    expect(serialized).not.toContain('Golden Retriever');
    expect(serialized).not.toContain('conversation-secret');
    expect(serialized).not.toContain('contact-secret');
    expect(serialized).not.toContain('appointment-secret');
    expect(minimized.message).toContain('[TUTOR]');
    expect(minimized.message).toContain('[PET_1]');
    expect(minimized.context.pets).toEqual([
      { name: '[PET_1]', species: 'cachorro' },
    ]);
    expect(minimized.context.memories).toEqual([]);
    expect(minimized.context.schedulingState).toEqual({
      stage: 'waiting_slot_confirmation',
    });
    expect(minimized.context.contactIntake).toEqual({
      contactRole: 'tutor',
      contactReason: 'Preciso saber sobre consulta; telefone [PHONE]',
    });
  });

  it('bounds conversation history and institutional knowledge', () => {
    const minimized = minimizeProviderInput(
      {
        contactName: 'Tutor',
        conversationHistory: Array.from(
          { length: 20 },
          (_, index) => `history-${index}-${'x'.repeat(2_000)}`
        ),
        memories: [],
        knowledge: Array.from(
          { length: 10 },
          (_, index) => ({
            id: `knowledge-${index}`,
            title: `Title ${index}`,
            content: `knowledge-${index}-${'y'.repeat(4_000)}`,
            source: 'manual',
            relevance: 0.9,
          })
        ),
      },
      'mensagem atual'
    );

    expect(minimized.context.conversationHistory).toHaveLength(6);
    expect(minimized.context.conversationHistory[0]).toContain('history-14');
    expect(minimized.context.conversationHistory.every(item => item.length <= 1_000)).toBe(true);
    expect(minimized.context.knowledge).toHaveLength(3);
    expect(minimized.context.knowledge.every(item => item.content.length <= 2_000)).toBe(true);
    expect(minimized.context.knowledge.map(item => item.content)).toEqual([
      expect.stringContaining('knowledge-0'),
      expect.stringContaining('knowledge-1'),
      expect.stringContaining('knowledge-2'),
    ]);
  });
});
