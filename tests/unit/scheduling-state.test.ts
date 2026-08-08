const mockRedisStore = vi.hoisted(() => new Map<string, string>());
const mockDurableStore = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const mockConfirmAppointment = vi.hoisted(() => vi.fn());

const mockSchedulingRepository = vi.hoisted(() => ({
  get: vi.fn(async (conversationId: string) => mockDurableStore.get(conversationId) || null),
  upsert: vi.fn(async (conversationId: string, state: Record<string, unknown>) => {
    const persisted = { ...state, updatedAt: '2026-08-08T00:00:00.000Z' };
    mockDurableStore.set(conversationId, persisted);
    return persisted;
  }),
}));

vi.mock('../../src/shared/redis', () => ({
  redisClient: {
    getClient: () => ({
      get: vi.fn(async (key: string) => mockRedisStore.get(key) || null),
      setex: vi.fn(async (key: string, _ttl: number, value: string) => {
        mockRedisStore.set(key, value);
        return 'OK';
      }),
    }),
  },
}));

vi.mock('../../src/modules/scheduling/tools', () => ({
  confirmAppointment: mockConfirmAppointment,
}));
vi.mock('../../src/modules/scheduling/stateRepository', () => ({
  schedulingStateRepository: mockSchedulingRepository,
}));

import {
  getSchedulingState,
  handleSchedulingStateMachine,
  setSchedulingState,
} from '../../src/modules/scheduling/state';

describe('scheduling state machine', () => {
  beforeEach(() => {
    mockRedisStore.clear();
    mockDurableStore.clear();
    mockConfirmAppointment.mockReset();
    mockSchedulingRepository.get.mockClear();
    mockSchedulingRepository.upsert.mockClear();
  });

  it('confirms a pending appointment deterministically on positive confirmation', async () => {
    await setSchedulingState('conversation-1', {
      stage: 'waiting_slot_confirmation',
      appointmentId: 'appointment-1',
      slotId: 'slot-1',
      contactId: 'contact-1',
      lastIntent: 'agendamento',
    });
    mockConfirmAppointment.mockResolvedValue({
      success: true,
      appointment: {
        id: 'appointment-1',
        slotId: 'slot-1',
        status: 'confirmed',
      },
    });

    const result = await handleSchedulingStateMachine('conversation-1', 'sim, pode confirmar');

    expect(mockConfirmAppointment).toHaveBeenCalledWith({
      appointmentId: 'appointment-1',
      conversationId: 'conversation-1',
      contactId: 'contact-1',
    });
    expect(result.handled).toBe(true);
    expect(result.stage).toBe('confirmed');

    const state = await getSchedulingState('conversation-1');
    expect(state?.stage).toBe('confirmed');
    expect(state?.contactId).toBe('contact-1');
    expect(mockSchedulingRepository.upsert).toHaveBeenCalled();
  });

  it('uses the durable state after the Redis cache is lost', async () => {
    await setSchedulingState('conversation-1', {
      stage: 'collecting_details',
      contactId: 'contact-1',
      lastIntent: 'agendamento',
    });
    mockRedisStore.clear();

    await expect(getSchedulingState('conversation-1')).resolves.toEqual(expect.objectContaining({
      stage: 'collecting_details',
      contactId: 'contact-1',
    }));
    expect(mockSchedulingRepository.get).toHaveBeenCalledWith('conversation-1');
  });

  it('asks for another time when the tutor rejects the pending slot', async () => {
    await setSchedulingState('conversation-1', {
      stage: 'waiting_slot_confirmation',
      appointmentId: 'appointment-1',
      slotId: 'slot-1',
      contactId: 'contact-1',
      lastIntent: 'agendamento',
    });

    const result = await handleSchedulingStateMachine('conversation-1', 'melhor outro horário');

    expect(mockConfirmAppointment).not.toHaveBeenCalled();
    expect(result.handled).toBe(true);
    expect(result.stage).toBe('collecting_details');
    expect(result.message).toContain('outro dia ou horario');
    expect((await getSchedulingState('conversation-1'))?.contactId).toBe('contact-1');
  });

  it('fails closed when a legacy pending state has no contact owner', async () => {
    await setSchedulingState('conversation-1', {
      stage: 'waiting_slot_confirmation',
      appointmentId: 'appointment-1',
      slotId: 'slot-1',
      lastIntent: 'agendamento',
    });

    const result = await handleSchedulingStateMachine('conversation-1', 'sim, pode confirmar');

    expect(mockConfirmAppointment).not.toHaveBeenCalled();
    expect(result).toEqual({
      handled: true,
      stage: 'waiting_slot_confirmation',
      appointmentId: 'appointment-1',
      message: 'Nao consegui confirmar esse horario automaticamente. Vou chamar um atendente para verificar para voce.',
    });
  });

  it('does not handle unrelated messages', async () => {
    const result = await handleSchedulingStateMachine('conversation-1', 'qual o valor da consulta?');

    expect(result).toEqual({ handled: false });
  });
});
