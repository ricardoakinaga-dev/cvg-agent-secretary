import { OpenRouterProvider } from '../../src/modules/ai/openrouter';

const baseContext = {
  contactName: 'Maria',
  conversationHistory: [],
  memories: [],
  knowledge: [],
};

describe('OpenRouter safety fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call OpenRouter for pending scheduling confirmations', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const provider = new OpenRouterProvider();

    const result = await provider.generate({
      message: 'sim, pode confirmar',
      context: {
        ...baseContext,
        schedulingState: {
          stage: 'waiting_slot_confirmation',
          appointmentId: 'appointment-1',
        },
      },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.action?.type).toBe('handoff');
    expect(result.action?.reason).toBe('openrouter_no_tooling');
    expect(result.content).toContain('confirmacao de horarios');
  });

  it('sanitizes operational claims from textual fallback responses', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Seu horario foi confirmado para amanha as 10h.',
            },
          },
        ],
      }),
    } as Response);

    const provider = new OpenRouterProvider();
    const result = await provider.generate({
      message: 'quero agendar',
      context: baseContext,
    });

    expect(result.action?.type).toBe('handoff');
    expect(result.action?.reason).toBe('openrouter_operational_claim');
    expect(result.content).not.toContain('confirmado para amanha');
    expect(result.content).toContain('confirmacao de horarios');
  });

  it('does not send direct identifiers, raw memories, pet breed, or unbounded history', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          finish_reason: 'stop',
          message: { content: 'Posso ajudar com informacoes institucionais.' },
        }],
      }),
    } as Response);

    const provider = new OpenRouterProvider();
    await provider.generate({
      message: 'Maria pergunta sobre Buddy. CPF 123.456.789-01.',
      context: {
        ...baseContext,
        conversationHistory: [
          'Maria: meu e-mail e maria@example.com e Buddy precisa de consulta.',
        ],
        memories: ['MEMORIA BRUTA: Maria prefere atendimento aos sabados.'],
        pets: [{
          id: 'pet-private-1',
          name: 'Buddy',
          species: 'cachorro',
          breed: 'Golden Retriever',
        }],
        knowledge: [{
          id: 'knowledge-1',
          content: 'Consultas gerais seguem ordem de chegada.',
          source: 'manual',
          relevance: 0.91,
        }],
      },
    });

    const providerPayload = fetchSpy.mock.calls[0][1]?.body as string;
    expect(providerPayload).not.toContain('Maria');
    expect(providerPayload).not.toContain('Buddy');
    expect(providerPayload).not.toContain('maria@example.com');
    expect(providerPayload).not.toContain('123.456.789-01');
    expect(providerPayload).not.toContain('MEMORIA BRUTA');
    expect(providerPayload).not.toContain('pet-private-1');
    expect(providerPayload).not.toContain('Golden Retriever');
    expect(providerPayload).toContain('[TUTOR]');
    expect(providerPayload).toContain('[PET_1]');
  });

  it('uses finish reason and institutional evidence for conservative confidence', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          finish_reason: 'stop',
          message: { content: 'Atendimento das 8h as 18h.' },
        }],
      }),
    } as Response);

    const provider = new OpenRouterProvider();
    const result = await provider.generate({
      message: 'qual o horario?',
      context: {
        ...baseContext,
        knowledge: [{
          id: 'knowledge-1',
          content: 'Atendimento das 8h as 18h.',
          source: 'manual',
          relevance: 0.9,
        }],
      },
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.confidence).toBeLessThan(0.8);
  });
});
