const mockKnowledge = vi.hoisted(() => ({ searchKnowledge: vi.fn() }));
const mockScheduling = vi.hoisted(() => ({
  checkAvailableSlots: vi.fn(),
  reserveSlot: vi.fn(),
  confirmAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
}));
const mockHandoff = vi.hoisted(() => ({ createHandoff: vi.fn(), notifySector: vi.fn() }));
const mockSchedulingState = vi.hoisted(() => ({ setSchedulingState: vi.fn() }));

vi.mock('../../src/modules/knowledge/tools', () => mockKnowledge);
vi.mock('../../src/modules/scheduling/tools', () => mockScheduling);
vi.mock('../../src/modules/scheduling/state', () => mockSchedulingState);
vi.mock('../../src/modules/handoff/tools', () => mockHandoff);

import { executeAgentTool, getOpenAITools } from '../../src/modules/agent-tools';

const SLOT_ID = '11111111-1111-4111-8111-111111111111';
const APPOINTMENT_ID = '22222222-2222-4222-8222-222222222222';

describe('agent tool security boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['search_knowledge', { query: 'vacinas', unexpected: true }],
    ['check_available_slots', { from: '2026-06-01T09:00:00.000Z', to: '2026-06-01T10:00:00.000Z', unexpected: true }],
    ['reserve_slot', { slotId: SLOT_ID, confirmed: true, unexpected: true }],
    ['confirm_appointment', { appointmentId: APPOINTMENT_ID, confirmed: true, unexpected: true }],
    ['cancel_appointment', { appointmentId: APPOINTMENT_ID, confirmed: true, unexpected: true }],
    ['reschedule_appointment', { appointmentId: APPOINTMENT_ID, slotId: SLOT_ID, confirmed: true, unexpected: true }],
    ['create_handoff', { triggerType: 'clinical_risk', triggerReason: 'urgent', unexpected: true }],
    ['notify_sector', { sector: 'clinico', message: 'urgent', confirmed: true, unexpected: true }],
  ])('rejects unknown fields for %s', async (name, args) => {
    await expect(executeAgentTool(name, JSON.stringify(args), {
      conversationId: 'conversation-1',
      contactId: 'contact-1',
    })).resolves.toEqual({ success: false, message: 'Invalid tool arguments' });
  });

  it.each([
    ['search_knowledge', 'null'],
    ['search_knowledge', '[]'],
    ['search_knowledge', '"query"'],
  ])('rejects non-object JSON arguments', async (name, rawArguments) => {
    await expect(executeAgentTool(name, rawArguments, {})).resolves.toEqual({
      success: false,
      message: 'Invalid tool arguments',
    });
  });

  it('rejects oversized strings, invalid enums, UUIDs, dates, and numerics', async () => {
    const attempts = [
      executeAgentTool('search_knowledge', JSON.stringify({ query: 'q'.repeat(1001) }), {}),
      executeAgentTool('search_knowledge', JSON.stringify({ query: 'vacinas', category: 'secret' }), {}),
      executeAgentTool('reserve_slot', JSON.stringify({ slotId: 'not-a-uuid', confirmed: true }), {
        conversationId: 'conversation-1', contactId: 'contact-1',
      }),
      executeAgentTool('check_available_slots', JSON.stringify({
        from: '2026-06-01', to: '2026-06-01T10:00:00.000Z',
      }), {}),
      executeAgentTool('check_available_slots', JSON.stringify({
        from: '2026-06-01T11:00:00.000Z', to: '2026-06-01T10:00:00.000Z',
      }), {}),
      executeAgentTool('check_available_slots', JSON.stringify({
        from: '2026-06-01T09:00:00.000Z', to: '2026-06-01T10:00:00.000Z', limit: 1.5,
      }), {}),
      executeAgentTool('notify_sector', JSON.stringify({ sector: 'root', message: 'hello', confirmed: true }), {}),
    ];

    await expect(Promise.all(attempts)).resolves.toEqual(
      Array.from({ length: attempts.length }, () => ({
        success: false,
        message: 'Invalid tool arguments',
      }))
    );
    expect(mockKnowledge.searchKnowledge).not.toHaveBeenCalled();
    expect(mockScheduling.reserveSlot).not.toHaveBeenCalled();
    expect(mockScheduling.checkAvailableSlots).not.toHaveBeenCalled();
    expect(mockHandoff.notifySector).not.toHaveBeenCalled();
  });

  it('rejects model-supplied identity instead of allowing trusted context override', async () => {
    const result = await executeAgentTool('reserve_slot', JSON.stringify({
      slotId: SLOT_ID,
      confirmed: true,
      conversationId: 'attacker-conversation',
      contactId: 'attacker-contact',
    }), {
      conversationId: 'trusted-conversation',
      contactId: 'trusted-contact',
    });

    expect(result).toEqual({ success: false, message: 'Invalid tool arguments' });
    expect(mockScheduling.reserveSlot).not.toHaveBeenCalled();
  });

  it('requires complete trusted ownership for every scheduling mutation', async () => {
    const results = await Promise.all([
      executeAgentTool('reserve_slot', JSON.stringify({ slotId: SLOT_ID, confirmed: true }), { conversationId: 'conversation-1' }),
      executeAgentTool('confirm_appointment', JSON.stringify({ appointmentId: APPOINTMENT_ID, confirmed: true }), { contactId: 'contact-1' }),
      executeAgentTool('cancel_appointment', JSON.stringify({ appointmentId: APPOINTMENT_ID, confirmed: true }), {}),
      executeAgentTool('reschedule_appointment', JSON.stringify({ appointmentId: APPOINTMENT_ID, slotId: SLOT_ID, confirmed: true }), {}),
    ]);

    expect(results).toEqual(Array.from({ length: 4 }, () => ({
      success: false,
      message: 'Appointment ownership context is required',
    })));
    expect(mockScheduling.reserveSlot).not.toHaveBeenCalled();
    expect(mockScheduling.confirmAppointment).not.toHaveBeenCalled();
    expect(mockScheduling.cancelAppointment).not.toHaveBeenCalled();
    expect(mockScheduling.rescheduleAppointment).not.toHaveBeenCalled();
  });

  it.each([
    ['reserve_slot', { slotId: SLOT_ID }],
    ['confirm_appointment', { appointmentId: APPOINTMENT_ID }],
    ['cancel_appointment', { appointmentId: APPOINTMENT_ID, confirmed: false }],
    ['reschedule_appointment', { appointmentId: APPOINTMENT_ID, slotId: SLOT_ID }],
    ['notify_sector', { sector: 'recepcao', message: 'Avisar humano' }],
  ])('requires an explicit true confirmation precondition for %s', async (name, args) => {
    const result = await executeAgentTool(name, JSON.stringify(args), {
      conversationId: 'conversation-1',
      contactId: 'contact-1',
    });

    expect(result).toEqual({ success: false, message: 'Invalid tool arguments' });
  });

  it('never exposes thrown internal error messages', async () => {
    mockHandoff.notifySector.mockRejectedValue(new Error('postgres password=top-secret'));

    const result = await executeAgentTool(
      'notify_sector',
      JSON.stringify({ sector: 'recepcao', message: 'Avisar humano', confirmed: true }),
      { userMessage: 'Quero falar com um atendente' }
    );

    expect(result).toEqual({ success: false, message: 'Tool execution failed' });
    expect(JSON.stringify(result)).not.toContain('top-secret');
  });

  it('does not trust a model confirmation flag without evidence in the user turn', async () => {
    const result = await executeAgentTool(
      'cancel_appointment',
      JSON.stringify({ appointmentId: APPOINTMENT_ID, confirmed: true }),
      { conversationId: 'conversation-1', contactId: 'contact-1' }
    );

    expect(result).toEqual({ success: false, message: 'User confirmation is required' });
    expect(mockScheduling.cancelAppointment).not.toHaveBeenCalled();
  });

  it('advertises closed object schemas and explicit confirmation preconditions', () => {
    const tools = getOpenAITools();

    for (const tool of tools) {
      expect(tool.function.parameters).toMatchObject({ additionalProperties: false });
    }
    for (const name of ['reserve_slot', 'confirm_appointment', 'cancel_appointment', 'reschedule_appointment', 'notify_sector']) {
      const tool = tools.find((candidate) => candidate.function.name === name);
      expect(tool?.function.parameters).toMatchObject({
        required: expect.arrayContaining(['confirmed']),
        properties: { confirmed: { const: true, type: 'boolean' } },
      });
    }
  });
});
