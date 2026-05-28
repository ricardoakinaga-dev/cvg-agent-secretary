const mockRedisStore = vi.hoisted(() => new Map<string, string>());
const mockConfirmAppointment = vi.hoisted(() => vi.fn());

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

import {
  getSchedulingState,
  handleSchedulingStateMachine,
  setSchedulingState,
} from '../../src/modules/scheduling/state';

describe('scheduling state machine', () => {
  beforeEach(() => {
    mockRedisStore.clear();
    mockConfirmAppointment.mockReset();
  });

  it('confirms a pending appointment deterministically on positive confirmation', async () => {
    await setSchedulingState('conversation-1', {
      stage: 'waiting_slot_confirmation',
      appointmentId: 'appointment-1',
      slotId: 'slot-1',
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

    expect(mockConfirmAppointment).toHaveBeenCalledWith({ appointmentId: 'appointment-1' });
    expect(result.handled).toBe(true);
    expect(result.stage).toBe('confirmed');

    const state = await getSchedulingState('conversation-1');
    expect(state?.stage).toBe('confirmed');
  });

  it('asks for another time when the tutor rejects the pending slot', async () => {
    await setSchedulingState('conversation-1', {
      stage: 'waiting_slot_confirmation',
      appointmentId: 'appointment-1',
      slotId: 'slot-1',
      lastIntent: 'agendamento',
    });

    const result = await handleSchedulingStateMachine('conversation-1', 'melhor outro horário');

    expect(mockConfirmAppointment).not.toHaveBeenCalled();
    expect(result.handled).toBe(true);
    expect(result.stage).toBe('collecting_details');
    expect(result.message).toContain('outro dia ou horario');
  });

  it('does not handle unrelated messages', async () => {
    const result = await handleSchedulingStateMachine('conversation-1', 'qual o valor da consulta?');

    expect(result).toEqual({ handled: false });
  });
});
