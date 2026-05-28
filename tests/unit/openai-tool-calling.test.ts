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
