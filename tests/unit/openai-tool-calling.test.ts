const mockChatCreate = vi.hoisted(() => vi.fn());
const mockModelsList = vi.hoisted(() => vi.fn());
const mockExecuteAgentTool = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: vi.fn(function OpenAIMock() {
    return {
      chat: {
        completions: {
          create: mockChatCreate,
        },
      },
      embeddings: {
        create: vi.fn(),
      },
      models: {
        list: mockModelsList,
      },
    };
  }),
}));

vi.mock('../../src/modules/agent-tools', () => ({
  getOpenAITools: vi.fn(() => [
    {
      type: 'function',
      function: {
        name: 'check_available_slots',
        description: 'check slots',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reserve_slot',
        description: 'reserve slot',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'confirm_appointment',
        description: 'confirm appointment',
        parameters: { type: 'object', properties: {} },
      },
    },
  ]),
  executeAgentTool: mockExecuteAgentTool,
}));

import { OpenAIClient, AgentContext } from '../../src/modules/openai/client';

const baseContext: AgentContext = {
  conversationId: 'conversation-1',
  contactId: 'contact-1',
  contactName: 'Maria',
  conversationHistory: [],
  memories: [],
  pets: [],
  knowledge: [],
};

function toolResponse(name: string, args: Record<string, unknown>, id: string) {
  return {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id,
              type: 'function',
              function: {
                name,
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
      },
    ],
  };
}

function finalResponse(content: string) {
  return {
    choices: [
      {
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content,
        },
      },
    ],
  };
}

describe('OpenAI tool calling flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs availability and reservation tools before producing a scheduling answer', async () => {
    mockChatCreate
      .mockResolvedValueOnce(toolResponse(
        'check_available_slots',
        {
          from: '2026-06-01T00:00:00.000Z',
          to: '2026-06-02T00:00:00.000Z',
          limit: 2,
        },
        'call-check'
      ))
      .mockResolvedValueOnce(toolResponse(
        'reserve_slot',
        {
          slotId: 'slot-1',
          petName: 'Buddy',
          reason: 'Consulta clinica',
        },
        'call-reserve'
      ))
      .mockResolvedValueOnce(finalResponse(
        'Encontrei um horario e deixei reservado temporariamente. Posso confirmar?'
      ));

    mockExecuteAgentTool
      .mockResolvedValueOnce({
        success: true,
        slots: [{ id: 'slot-1', startsAt: '2026-06-01T13:00:00.000Z' }],
      })
      .mockResolvedValueOnce({
        success: true,
        appointment: { id: 'appointment-1', slotId: 'slot-1', status: 'reserved' },
      });

    const client = new OpenAIClient();
    const result = await client.generateResponse('quero agendar consulta para o Buddy', baseContext);

    expect(result.content).toBe('Encontrei um horario e deixei reservado temporariamente. Posso confirmar?');
    expect(mockExecuteAgentTool).toHaveBeenNthCalledWith(
      1,
      'check_available_slots',
      JSON.stringify({
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-02T00:00:00.000Z',
        limit: 2,
      }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        contactName: 'Maria',
        userMessage: 'quero agendar consulta para o Buddy',
      }
    );
    expect(mockExecuteAgentTool).toHaveBeenNthCalledWith(
      2,
      'reserve_slot',
      JSON.stringify({
        slotId: 'slot-1',
        petName: 'Buddy',
        reason: 'Consulta clinica',
      }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        contactName: 'Maria',
        userMessage: 'quero agendar consulta para o Buddy',
      }
    );

    const thirdCallMessages = mockChatCreate.mock.calls[2][0].messages;
    expect(thirdCallMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call-check',
        content: expect.stringContaining('"slots"'),
      }),
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call-reserve',
        content: expect.stringContaining('"appointment"'),
      }),
    ]));
  });

  it('sends only minimized context to OpenAI while retaining trusted tool authorization context', async () => {
    mockChatCreate
      .mockResolvedValueOnce(toolResponse(
        'reserve_slot',
        {
          slotId: 'slot-1',
          petName: '[PET_1]',
          reason: 'Consulta clinica',
        },
        'call-reserve'
      ))
      .mockResolvedValueOnce(finalResponse('Deixei o horario reservado temporariamente.'));
    mockExecuteAgentTool.mockResolvedValueOnce({
      success: true,
      appointment: {
        id: 'appointment-1',
        status: 'reserved',
        petId: 'pet-private-1',
        petName: 'Buddy',
        tutorName: 'Maria',
      },
    });

    const privateContext: AgentContext = {
      ...baseContext,
      conversationHistory: [
        'Maria escreveu de maria@example.com sobre Buddy e o CPF 123.456.789-01.',
      ],
      memories: ['MEMORIA BRUTA: Maria prefere o veterinario Dr. Carlos.'],
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
        relevance: 0.92,
      }],
    };

    const client = new OpenAIClient();
    await client.generateResponse(
      'Maria quer reservar para Buddy. E-mail maria@example.com, CPF 123.456.789-01.',
      privateContext
    );

    const providerPayload = JSON.stringify(mockChatCreate.mock.calls[0][0].messages);
    expect(providerPayload).not.toContain('Maria');
    expect(providerPayload).not.toContain('Buddy');
    expect(providerPayload).not.toContain('maria@example.com');
    expect(providerPayload).not.toContain('123.456.789-01');
    expect(providerPayload).not.toContain('MEMORIA BRUTA');
    expect(providerPayload).not.toContain('pet-private-1');
    expect(providerPayload).not.toContain('Golden Retriever');
    expect(providerPayload).toContain('[TUTOR]');
    expect(providerPayload).toContain('[PET_1]');

    const followupPayload = JSON.stringify(mockChatCreate.mock.calls[1][0].messages);
    expect(followupPayload).not.toContain('pet-private-1');
    expect(followupPayload).not.toContain('Buddy');
    expect(followupPayload).not.toContain('Maria');

    expect(mockExecuteAgentTool).toHaveBeenCalledWith(
      'reserve_slot',
      JSON.stringify({
        slotId: 'slot-1',
        petName: 'Buddy',
        reason: 'Consulta clinica',
      }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        contactName: 'Maria',
        userMessage: 'Maria quer reservar para Buddy. E-mail maria@example.com, CPF 123.456.789-01.',
      }
    );
  });

  it('derives conservative confidence from finish reason and available evidence', async () => {
    mockChatCreate.mockResolvedValueOnce(finalResponse('Resposta baseada na base institucional.'));

    const client = new OpenAIClient();
    const withEvidence = await client.generateResponse('qual o horario?', {
      ...baseContext,
      knowledge: [{
        id: 'knowledge-1',
        content: 'Atendimento das 8h as 18h.',
        source: 'manual',
        relevance: 0.91,
      }],
    });

    expect(withEvidence.confidence).toBeGreaterThanOrEqual(0.6);
    expect(withEvidence.confidence).toBeLessThan(0.8);

    mockChatCreate.mockResolvedValueOnce({
      choices: [{
        finish_reason: 'length',
        message: { role: 'assistant', content: 'Resposta incompleta' },
      }],
    });

    const truncated = await client.generateResponse('duvida generica', baseContext);
    expect(truncated.confidence).toBeLessThan(0.6);
  });

  it('propagates provider failures so the AI router can use its fallback provider', async () => {
    mockChatCreate.mockRejectedValueOnce(new Error('OpenAI unavailable'));

    const client = new OpenAIClient();

    await expect(client.generateResponse('olá', baseContext))
      .rejects
      .toThrow('OpenAI unavailable');
  });

  it('returns fallback when availability tool cannot provide reliable slots', async () => {
    mockChatCreate.mockResolvedValueOnce(toolResponse(
      'check_available_slots',
      {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-02T00:00:00.000Z',
        limit: 2,
      },
      'call-check'
    ));

    mockExecuteAgentTool.mockResolvedValueOnce({
      success: false,
      slots: [],
      message: 'relation "appointment_slots" does not exist',
    });

    const client = new OpenAIClient();
    const result = await client.generateResponse(
      'meu cachorro esta doente e preciso passar em consulta',
      baseContext
    );

    expect(result).toEqual({
      content: 'Peço desculpas, estou tendo dificuldades para processar sua solicitação neste momento. Um de nossos atendentes logo irá ajudá-lo.',
      confidence: 0,
      action: {
        type: 'fallback',
        reason: 'check_available_slots_needs_human',
      },
    });
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
  });

  it('returns fallback when availability tool finds no slots instead of letting the model infer no appointments', async () => {
    mockChatCreate.mockResolvedValueOnce(toolResponse(
      'check_available_slots',
      {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-02T00:00:00.000Z',
        limit: 2,
      },
      'call-check'
    ));

    mockExecuteAgentTool.mockResolvedValueOnce({
      success: true,
      slots: [],
    });

    const client = new OpenAIClient();
    const result = await client.generateResponse('quero consulta hoje', baseContext);

    expect(result.action).toEqual({
      type: 'fallback',
      reason: 'check_available_slots_needs_human',
    });
    expect(result.confidence).toBe(0);
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
  });

  it('runs confirm_appointment before producing a confirmed appointment answer', async () => {
    mockChatCreate
      .mockResolvedValueOnce(toolResponse(
        'confirm_appointment',
        { appointmentId: 'appointment-1' },
        'call-confirm'
      ))
      .mockResolvedValueOnce(finalResponse('Horario confirmado com sucesso para o Buddy.'));
    mockExecuteAgentTool.mockResolvedValueOnce({
      success: true,
      appointment: {
        id: 'appointment-1',
        slotId: 'slot-1',
        status: 'confirmed',
      },
    });

    const client = new OpenAIClient();
    const result = await client.generateResponse('sim, pode confirmar', {
      ...baseContext,
      schedulingState: {
        stage: 'waiting_slot_confirmation',
        appointmentId: 'appointment-1',
      },
    });

    expect(result.content).toBe('Horario confirmado com sucesso para o Buddy.');
    expect(mockExecuteAgentTool).toHaveBeenCalledWith(
      'confirm_appointment',
      JSON.stringify({ appointmentId: 'appointment-1' }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        contactName: 'Maria',
        userMessage: 'sim, pode confirmar',
      }
    );

    const secondCallMessages = mockChatCreate.mock.calls[1][0].messages;
    expect(secondCallMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('"waiting_slot_confirmation"'),
      }),
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call-confirm',
        content: expect.stringContaining('"confirmed"'),
      }),
    ]));
  });
});
