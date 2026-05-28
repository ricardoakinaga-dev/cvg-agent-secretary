const mockKnowledge = vi.hoisted(() => ({
  searchKnowledge: vi.fn(),
}));

const mockScheduling = vi.hoisted(() => ({
  checkAvailableSlots: vi.fn(),
  reserveSlot: vi.fn(),
  confirmAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
}));

const mockHandoff = vi.hoisted(() => ({
  createHandoff: vi.fn(),
  notifySector: vi.fn(),
}));

const mockSchedulingState = vi.hoisted(() => ({
  setSchedulingState: vi.fn(),
}));

vi.mock('../../src/modules/knowledge/tools', () => mockKnowledge);
vi.mock('../../src/modules/scheduling/tools', () => mockScheduling);
vi.mock('../../src/modules/scheduling/state', () => mockSchedulingState);
vi.mock('../../src/modules/handoff/tools', () => mockHandoff);

import { executeAgentTool, getOpenAITools } from '../../src/modules/agent-tools';

describe('agent tool registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes OpenAI-compatible tool schemas', () => {
    const tools = getOpenAITools();

    expect(tools.some((tool) => tool.function.name === 'search_knowledge')).toBe(true);
    expect(tools.some((tool) => tool.function.name === 'confirm_appointment')).toBe(true);
  });

  it('executes search_knowledge with parsed arguments', async () => {
    mockKnowledge.searchKnowledge.mockResolvedValue({ found: true, count: 1, results: [] });

    const result = await executeAgentTool(
      'search_knowledge',
      JSON.stringify({ query: 'horario de atendimento', limit: 3 }),
      {}
    );

    expect(mockKnowledge.searchKnowledge).toHaveBeenCalledWith({
      query: 'horario de atendimento',
      category: undefined,
      limit: 3,
    });
    expect(result).toEqual({ found: true, count: 1, results: [] });
  });

  it('injects runtime context into reserve_slot calls', async () => {
    mockScheduling.reserveSlot.mockResolvedValue({ success: true, message: 'ok' });

    await executeAgentTool(
      'reserve_slot',
      JSON.stringify({ slotId: 'slot-1', petName: 'Buddy' }),
      { conversationId: 'conversation-1', contactId: 'contact-1', contactName: 'Maria' }
    );

    expect(mockScheduling.reserveSlot).toHaveBeenCalledWith({
      slotId: 'slot-1',
      serviceId: undefined,
      conversationId: 'conversation-1',
      contactId: 'contact-1',
      petId: undefined,
      tutorName: 'Maria',
      petName: 'Buddy',
      reason: undefined,
      holdMinutes: undefined,
    });
  });

  it('rejects invalid slot availability dates before calling scheduling', async () => {
    const result = await executeAgentTool(
      'check_available_slots',
      JSON.stringify({ from: 'not-a-date', to: 'also-invalid' }),
      {}
    );

    expect(result).toEqual({
      success: false,
      slots: [],
      message: 'from and to must be valid ISO dates',
    });
    expect(mockScheduling.checkAvailableSlots).not.toHaveBeenCalled();
  });

  it('executes check_available_slots with parsed date arguments', async () => {
    mockScheduling.checkAvailableSlots.mockResolvedValue({ success: true, slots: [] });

    const result = await executeAgentTool(
      'check_available_slots',
      JSON.stringify({
        serviceId: 'service-1',
        from: '2026-06-01T09:00:00.000Z',
        to: '2026-06-01T18:00:00.000Z',
        limit: 4,
      }),
      {}
    );

    expect(mockScheduling.checkAvailableSlots).toHaveBeenCalledWith({
      serviceId: 'service-1',
      from: new Date('2026-06-01T09:00:00.000Z'),
      to: new Date('2026-06-01T18:00:00.000Z'),
      limit: 4,
    });
    expect(result).toEqual({ success: true, slots: [] });
  });

  it('updates scheduling state after a successful reservation with appointment data', async () => {
    mockScheduling.reserveSlot.mockResolvedValue({
      success: true,
      appointment: {
        id: 'appointment-1',
        slotId: 'slot-1',
        serviceId: 'service-1',
        petName: 'Buddy',
      },
    });

    await executeAgentTool(
      'reserve_slot',
      JSON.stringify({ slotId: 'slot-1', serviceId: 'service-1' }),
      { conversationId: 'conversation-1', contactId: 'contact-1' }
    );

    expect(mockSchedulingState.setSchedulingState).toHaveBeenCalledWith('conversation-1', {
      stage: 'waiting_slot_confirmation',
      appointmentId: 'appointment-1',
      slotId: 'slot-1',
      serviceId: 'service-1',
      petName: 'Buddy',
      lastIntent: 'agendamento',
    });
  });

  it('does not update scheduling state when reservation fails', async () => {
    mockScheduling.reserveSlot.mockResolvedValue({ success: false, message: 'slot unavailable' });

    await executeAgentTool(
      'reserve_slot',
      JSON.stringify({ slotId: 'slot-1' }),
      { conversationId: 'conversation-1' }
    );

    expect(mockSchedulingState.setSchedulingState).not.toHaveBeenCalled();
  });

  it('confirms appointments and stores confirmed scheduling state', async () => {
    mockScheduling.confirmAppointment.mockResolvedValue({
      success: true,
      appointment: {
        id: 'appointment-1',
        slotId: 'slot-1',
        serviceId: 'service-1',
        petName: 'Buddy',
      },
    });

    const result = await executeAgentTool(
      'confirm_appointment',
      JSON.stringify({ appointmentId: 'appointment-1' }),
      { conversationId: 'conversation-1' }
    );

    expect(mockScheduling.confirmAppointment).toHaveBeenCalledWith({ appointmentId: 'appointment-1' });
    expect(mockSchedulingState.setSchedulingState).toHaveBeenCalledWith('conversation-1', {
      stage: 'confirmed',
      appointmentId: 'appointment-1',
      slotId: 'slot-1',
      serviceId: 'service-1',
      petName: 'Buddy',
      lastIntent: 'agendamento',
    });
    expect(result).toMatchObject({ success: true });
  });

  it('cancels appointments and stores cancelled scheduling state', async () => {
    mockScheduling.cancelAppointment.mockResolvedValue({
      success: true,
      appointment: {
        id: 'appointment-1',
        slotId: 'slot-1',
        serviceId: null,
        petName: 'Buddy',
      },
    });

    await executeAgentTool(
      'cancel_appointment',
      JSON.stringify({ appointmentId: 'appointment-1', reason: 'Tutor pediu' }),
      { conversationId: 'conversation-1' }
    );

    expect(mockScheduling.cancelAppointment).toHaveBeenCalledWith({
      appointmentId: 'appointment-1',
      reason: 'Tutor pediu',
    });
    expect(mockSchedulingState.setSchedulingState).toHaveBeenCalledWith('conversation-1', {
      stage: 'cancelled',
      appointmentId: 'appointment-1',
      slotId: 'slot-1',
      serviceId: undefined,
      petName: 'Buddy',
      lastIntent: 'cancelamento',
    });
  });

  it('executes reschedule_appointment with runtime context', async () => {
    mockScheduling.rescheduleAppointment.mockResolvedValue({ success: true });

    await executeAgentTool(
      'reschedule_appointment',
      JSON.stringify({ appointmentId: 'appointment-1', slotId: 'slot-2', reason: 'Novo horario' }),
      { conversationId: 'conversation-1', contactId: 'contact-1' }
    );

    expect(mockScheduling.rescheduleAppointment).toHaveBeenCalledWith({
      appointmentId: 'appointment-1',
      slotId: 'slot-2',
      conversationId: 'conversation-1',
      contactId: 'contact-1',
      reason: 'Novo horario',
    });
  });

  it('creates handoff records with context and pending questions', async () => {
    mockHandoff.createHandoff.mockResolvedValue({ success: true, handoffId: 'handoff-1' });

    await executeAgentTool(
      'create_handoff',
      JSON.stringify({
        triggerType: 'clinical_risk',
        triggerReason: 'Tutor descreveu emergencia',
        summary: 'Possivel urgencia',
        pendingQuestions: ['Quanto tempo?', 123, 'Tem sangramento?'],
        whatWasAnswered: 'Orientacao de procurar atendimento',
        whatIsMissing: 'Triagem humana',
        riskLevel: 'high',
      }),
      { conversationId: 'conversation-1', contactId: 'contact-1' }
    );

    expect(mockHandoff.createHandoff).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      contactId: 'contact-1',
      triggerType: 'clinical_risk',
      triggerReason: 'Tutor descreveu emergencia',
      summary: 'Possivel urgencia',
      pendingQuestions: ['Quanto tempo?', 'Tem sangramento?'],
      whatWasAnswered: 'Orientacao de procurar atendimento',
      whatIsMissing: 'Triagem humana',
      riskLevel: 'high',
    });
  });

  it('uses safe defaults when creating handoff without context', async () => {
    mockHandoff.createHandoff.mockResolvedValue({ success: true });

    await executeAgentTool('create_handoff', '{}', {});

    expect(mockHandoff.createHandoff).toHaveBeenCalledWith({
      conversationId: 'unknown',
      contactId: undefined,
      triggerType: 'agent_tool',
      triggerReason: 'handoff requested',
      summary: undefined,
      pendingQuestions: undefined,
      whatWasAnswered: undefined,
      whatIsMissing: undefined,
      riskLevel: undefined,
    });
  });

  it('notifies sectors with context', async () => {
    mockHandoff.notifySector.mockResolvedValue({ success: true });

    await executeAgentTool(
      'notify_sector',
      JSON.stringify({ sector: 'recepcao', message: 'Confirmar agenda', priority: 'high' }),
      { conversationId: 'conversation-1', contactId: 'contact-1' }
    );

    expect(mockHandoff.notifySector).toHaveBeenCalledWith({
      sector: 'recepcao',
      message: 'Confirmar agenda',
      priority: 'high',
      conversationId: 'conversation-1',
      contactId: 'contact-1',
    });
  });

  it('returns a safe failure payload when a tool throws', async () => {
    mockHandoff.notifySector.mockRejectedValue(new Error('network unavailable'));

    const result = await executeAgentTool(
      'notify_sector',
      JSON.stringify({ sector: 'recepcao', message: 'Avisar humano' }),
      {}
    );

    expect(result).toEqual({
      success: false,
      message: 'network unavailable',
    });
  });

  it('rejects invalid JSON arguments', async () => {
    const result = await executeAgentTool('search_knowledge', '{bad json', {});

    expect(result).toEqual({
      success: false,
      message: 'Tool arguments must be valid JSON',
    });
  });

  it('rejects unknown tools', async () => {
    const result = await executeAgentTool('unknown_tool', '{}', {});

    expect(result).toEqual({
      success: false,
      message: 'Unknown tool: unknown_tool',
    });
  });
});
