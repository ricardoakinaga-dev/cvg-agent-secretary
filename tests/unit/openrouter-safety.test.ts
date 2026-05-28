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
});
