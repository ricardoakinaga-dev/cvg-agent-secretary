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

const APPOINTMENT_ID = '22222222-2222-4222-8222-222222222222';
const SLOT_ID = '11111111-1111-4111-8111-111111111111';
const NEW_SLOT_ID = '33333333-3333-4333-8333-333333333333';
const SERVICE_ID = '44444444-4444-4444-8444-444444444444';

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
      JSON.stringify({ slotId: SLOT_ID, petName: 'Buddy', confirmed: true }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        contactName: 'Maria',
        userMessage: 'Quero reservar esse horario',
      }
    );

    expect(mockScheduling.reserveSlot).toHaveBeenCalledWith({
      slotId: SLOT_ID,
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
      message: 'Invalid tool arguments',
    });
    expect(mockScheduling.checkAvailableSlots).not.toHaveBeenCalled();
  });

  it('executes check_available_slots with parsed date arguments', async () => {
    mockScheduling.checkAvailableSlots.mockResolvedValue({ success: true, slots: [] });

    const result = await executeAgentTool(
      'check_available_slots',
      JSON.stringify({
        serviceId: SERVICE_ID,
        from: '2026-06-01T09:00:00.000Z',
        to: '2026-06-01T18:00:00.000Z',
        limit: 4,
      }),
      {}
    );

    expect(mockScheduling.checkAvailableSlots).toHaveBeenCalledWith({
      serviceId: SERVICE_ID,
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
        id: APPOINTMENT_ID,
        slotId: SLOT_ID,
        serviceId: SERVICE_ID,
        petName: 'Buddy',
      },
    });

    await executeAgentTool(
      'reserve_slot',
      JSON.stringify({ slotId: SLOT_ID, serviceId: SERVICE_ID, confirmed: true }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        userMessage: 'Pode reservar esse horario',
      }
    );

    expect(mockSchedulingState.setSchedulingState).toHaveBeenCalledWith('conversation-1', {
      stage: 'waiting_slot_confirmation',
      appointmentId: APPOINTMENT_ID,
      slotId: SLOT_ID,
      serviceId: SERVICE_ID,
      petName: 'Buddy',
      contactId: 'contact-1',
      lastIntent: 'agendamento',
    });
  });

  it('does not update scheduling state when reservation fails', async () => {
    mockScheduling.reserveSlot.mockResolvedValue({ success: false, message: 'slot unavailable' });

    await executeAgentTool(
      'reserve_slot',
      JSON.stringify({ slotId: SLOT_ID, confirmed: true }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        userMessage: 'Quero reservar',
      }
    );

    expect(mockSchedulingState.setSchedulingState).not.toHaveBeenCalled();
  });

  it('confirms appointments and stores confirmed scheduling state', async () => {
    mockScheduling.confirmAppointment.mockResolvedValue({
      success: true,
      appointment: {
        id: APPOINTMENT_ID,
        slotId: SLOT_ID,
        serviceId: SERVICE_ID,
        petName: 'Buddy',
      },
    });

    const result = await executeAgentTool(
      'confirm_appointment',
      JSON.stringify({ appointmentId: APPOINTMENT_ID, confirmed: true }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        userMessage: 'Sim, pode confirmar',
      }
    );

    expect(mockScheduling.confirmAppointment).toHaveBeenCalledWith({
      appointmentId: APPOINTMENT_ID,
      conversationId: 'conversation-1',
      contactId: 'contact-1',
    });
    expect(mockSchedulingState.setSchedulingState).toHaveBeenCalledWith('conversation-1', {
      stage: 'confirmed',
      appointmentId: APPOINTMENT_ID,
      slotId: SLOT_ID,
      serviceId: SERVICE_ID,
      petName: 'Buddy',
      contactId: 'contact-1',
      lastIntent: 'agendamento',
    });
    expect(result).toMatchObject({ success: true });
  });

  it('cancels appointments and stores cancelled scheduling state', async () => {
    mockScheduling.cancelAppointment.mockResolvedValue({
      success: true,
      appointment: {
        id: APPOINTMENT_ID,
        slotId: SLOT_ID,
        serviceId: null,
        petName: 'Buddy',
      },
    });

    await executeAgentTool(
      'cancel_appointment',
      JSON.stringify({ appointmentId: APPOINTMENT_ID, reason: 'Tutor pediu', confirmed: true }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        userMessage: 'Quero cancelar',
      }
    );

    expect(mockScheduling.cancelAppointment).toHaveBeenCalledWith({
      appointmentId: APPOINTMENT_ID,
      reason: 'Tutor pediu',
      conversationId: 'conversation-1',
      contactId: 'contact-1',
    });
    expect(mockSchedulingState.setSchedulingState).toHaveBeenCalledWith('conversation-1', {
      stage: 'cancelled',
      appointmentId: APPOINTMENT_ID,
      slotId: SLOT_ID,
      serviceId: undefined,
      petName: 'Buddy',
      contactId: 'contact-1',
      lastIntent: 'cancelamento',
    });
  });

  it('executes reschedule_appointment with runtime context', async () => {
    mockScheduling.rescheduleAppointment.mockResolvedValue({ success: true });

    await executeAgentTool(
      'reschedule_appointment',
      JSON.stringify({ appointmentId: APPOINTMENT_ID, slotId: NEW_SLOT_ID, reason: 'Novo horario', confirmed: true }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        userMessage: 'Quero remarcar',
      }
    );

    expect(mockScheduling.rescheduleAppointment).toHaveBeenCalledWith({
      appointmentId: APPOINTMENT_ID,
      slotId: NEW_SLOT_ID,
      conversationId: 'conversation-1',
      contactId: 'contact-1',
      reason: 'Novo horario',
    });
  });

  it('rejects appointment mutations when tool ownership context is incomplete', async () => {
    const confirmResult = await executeAgentTool(
      'confirm_appointment',
      JSON.stringify({ appointmentId: APPOINTMENT_ID, confirmed: true }),
      { conversationId: 'conversation-1' }
    );
    const cancelResult = await executeAgentTool(
      'cancel_appointment',
      JSON.stringify({ appointmentId: APPOINTMENT_ID, confirmed: true }),
      { contactId: 'contact-1' }
    );
    const rescheduleResult = await executeAgentTool(
      'reschedule_appointment',
      JSON.stringify({ appointmentId: APPOINTMENT_ID, slotId: NEW_SLOT_ID, confirmed: true }),
      {}
    );

    expect(confirmResult).toEqual({
      success: false,
      message: 'Appointment ownership context is required',
    });
    expect(cancelResult).toEqual({
      success: false,
      message: 'Appointment ownership context is required',
    });
    expect(rescheduleResult).toEqual({
      success: false,
      message: 'Appointment ownership context is required',
    });
    expect(mockScheduling.confirmAppointment).not.toHaveBeenCalled();
    expect(mockScheduling.cancelAppointment).not.toHaveBeenCalled();
    expect(mockScheduling.rescheduleAppointment).not.toHaveBeenCalled();
  });

  it('creates handoff records with context and pending questions', async () => {
    mockHandoff.createHandoff.mockResolvedValue({ success: true, handoffId: 'handoff-1' });

    await executeAgentTool(
      'create_handoff',
      JSON.stringify({
        triggerType: 'clinical_risk',
        triggerReason: 'Tutor descreveu emergencia',
        summary: 'Possivel urgencia',
        pendingQuestions: ['Quanto tempo?', 'Tem sangramento?'],
        whatWasAnswered: 'Orientacao de procurar atendimento',
        whatIsMissing: 'Triagem humana',
        riskLevel: 'high',
      }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        userMessage: 'Quero falar com um atendente',
      }
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

  it('rejects handoff creation without its required reason fields', async () => {
    await expect(executeAgentTool('create_handoff', '{}', {})).resolves.toEqual({
      success: false,
      message: 'Invalid tool arguments',
    });
    expect(mockHandoff.createHandoff).not.toHaveBeenCalled();
  });

  it('notifies sectors with context', async () => {
    mockHandoff.notifySector.mockResolvedValue({ success: true });

    await executeAgentTool(
      'notify_sector',
      JSON.stringify({ sector: 'recepcao', message: 'Confirmar agenda', priority: 'high', confirmed: true }),
      {
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        userMessage: 'Quero falar com a recepcao',
      }
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
      JSON.stringify({ sector: 'recepcao', message: 'Avisar humano', confirmed: true }),
      { userMessage: 'Quero falar com um atendente' }
    );

    expect(result).toEqual({
      success: false,
      message: 'Tool execution failed',
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
