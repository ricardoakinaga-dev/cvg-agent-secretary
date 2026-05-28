const mockChatwootClient = vi.hoisted(() => ({
  addLabel: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../../src/modules/chatwoot/client', () => ({
  chatwootClient: mockChatwootClient,
}));

import {
  createTransferMessage,
  createWaitingMessage,
  executeHandoff,
  generateHandoffSummary,
  getLabelsForIntent,
  HANDOFF_LABELS,
} from '../../src/modules/chatwoot/integration';

describe('chatwoot integration', () => {
  const summary = {
    contactName: 'Maria',
    petName: 'Buddy',
    conversationHistory: ['Tutor: preciso de ajuda', 'Agente: claro'],
    whatClientWanted: 'Agendar consulta',
    informationCollected: {
      pet: 'Buddy',
      preferencia: 'manha',
    },
    handoffReason: 'Tutor pediu humano',
    pendingQuestions: ['Qual unidade?'],
    whatWasAnswered: ['Informamos horarios gerais'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a structured handoff summary for human agents', () => {
    const result = generateHandoffSummary(summary);

    expect(result).toContain('Maria');
    expect(result).toContain('Buddy');
    expect(result).toContain('Agendar consulta');
    expect(result).toContain('Qual unidade?');
    expect(result).toContain('Informamos horarios gerais');
  });

  it('omits optional sections when summary fields are empty', () => {
    const result = generateHandoffSummary({
      contactName: 'Joao',
      conversationHistory: [],
      whatClientWanted: 'Tirar duvida',
      informationCollected: {},
      handoffReason: 'Baixa confianca',
      pendingQuestions: [],
      whatWasAnswered: [],
    });

    expect(result).toContain('Joao');
    expect(result).toContain('Tirar duvida');
    expect(result).not.toContain('Pet:');
    expect(result).not.toContain('PERGUNTAS PENDENTES');
  });

  it('executes handoff by labeling the conversation and adding a private note', async () => {
    mockChatwootClient.addLabel.mockResolvedValue(undefined);
    mockChatwootClient.sendMessage.mockResolvedValue({ id: 1 });

    await executeHandoff(42, summary, [HANDOFF_LABELS.URGENT]);

    expect(mockChatwootClient.addLabel).toHaveBeenCalledWith(42, HANDOFF_LABELS.HANDOFF);
    expect(mockChatwootClient.addLabel).toHaveBeenCalledWith(42, HANDOFF_LABELS.URGENT);
    expect(mockChatwootClient.sendMessage).toHaveBeenCalledWith({
      conversationId: 42,
      content: expect.stringContaining('Maria'),
      private: true,
    });
  });

  it('continues handoff when adding one label fails', async () => {
    mockChatwootClient.addLabel
      .mockRejectedValueOnce(new Error('label failed'))
      .mockResolvedValueOnce(undefined);
    mockChatwootClient.sendMessage.mockResolvedValue({ id: 1 });

    await executeHandoff(42, summary, [HANDOFF_LABELS.ESCALATED]);

    expect(mockChatwootClient.addLabel).toHaveBeenCalledTimes(2);
    expect(mockChatwootClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 42, private: true })
    );
  });

  it('propagates handoff failures when the private note cannot be sent', async () => {
    mockChatwootClient.addLabel.mockResolvedValue(undefined);
    mockChatwootClient.sendMessage.mockRejectedValue(new Error('send failed'));

    await expect(executeHandoff(42, summary)).rejects.toThrow('send failed');
  });

  it('creates tutor-facing transfer and waiting messages', () => {
    expect(createTransferMessage()).toContain('transferir');
    expect(createWaitingMessage()).toContain('Aguarde');
  });

  it('maps intents and risk levels to Chatwoot labels', () => {
    expect(getLabelsForIntent('possivel_urgencia')).toEqual([HANDOFF_LABELS.URGENT]);
    expect(getLabelsForIntent('reclamacao')).toEqual([HANDOFF_LABELS.COMPLAINT]);
    expect(getLabelsForIntent('financeiro_sensivel')).toEqual([HANDOFF_LABELS.FINANCIAL]);
    expect(getLabelsForIntent('pedido_humano')).toEqual([HANDOFF_LABELS.ESCALATED]);
    expect(getLabelsForIntent('outro', 'high')).toEqual([HANDOFF_LABELS.URGENT]);
    expect(getLabelsForIntent('outro', 'low')).toEqual([]);
  });
});
