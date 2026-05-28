const mockSchedulingRepository = vi.hoisted(() => ({
  checkAvailableSlots: vi.fn(),
  reserveSlot: vi.fn(),
  confirmAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
}));

vi.mock('../../src/modules/scheduling/repository', () => ({
  schedulingRepository: mockSchedulingRepository,
}));

import {
  cancelAppointment,
  checkAvailableSlots,
  confirmAppointment,
  reserveSlot,
  rescheduleAppointment,
  schedulingTools,
} from '../../src/modules/scheduling/tools';

describe('scheduling tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns available slots from repository', async () => {
    const slot = {
      id: 'slot-1',
      serviceId: 'service-1',
      providerId: 'provider-1',
      startsAt: new Date('2026-06-01T13:00:00.000Z'),
      endsAt: new Date('2026-06-01T13:30:00.000Z'),
      status: 'available',
    };
    mockSchedulingRepository.checkAvailableSlots.mockResolvedValue([slot]);

    const result = await checkAvailableSlots({
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-02T00:00:00.000Z'),
    });

    expect(result).toEqual({ success: true, slots: [slot] });
  });

  it('returns empty availability when repository check fails', async () => {
    mockSchedulingRepository.checkAvailableSlots.mockRejectedValue(new Error('database unavailable'));

    const result = await checkAvailableSlots({
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-02T00:00:00.000Z'),
    });

    expect(result).toEqual({ success: false, slots: [] });
  });

  it('reserves a slot temporarily', async () => {
    const appointment = { id: 'appointment-1', slotId: 'slot-1', status: 'reserved' };
    mockSchedulingRepository.reserveSlot.mockResolvedValue(appointment);

    const result = await reserveSlot({ slotId: 'slot-1', contactId: 'contact-1' });

    expect(result.success).toBe(true);
    expect(result.appointment).toBe(appointment);
    expect(result.message).toBe('Slot reserved temporarily');
  });

  it('returns failure when slot reservation fails', async () => {
    mockSchedulingRepository.reserveSlot.mockRejectedValue(new Error('Slot is not available'));

    const result = await reserveSlot({ slotId: 'slot-1' });

    expect(result).toEqual({
      success: false,
      message: 'Slot is not available',
    });
  });

  it('confirms only through the repository confirmation path', async () => {
    const appointment = { id: 'appointment-1', slotId: 'slot-1', status: 'confirmed' };
    mockSchedulingRepository.confirmAppointment.mockResolvedValue(appointment);

    const result = await confirmAppointment({ appointmentId: 'appointment-1' });

    expect(mockSchedulingRepository.confirmAppointment).toHaveBeenCalledWith({
      appointmentId: 'appointment-1',
    });
    expect(result.success).toBe(true);
    expect(result.appointment).toBe(appointment);
  });

  it('returns failure when appointment confirmation fails', async () => {
    mockSchedulingRepository.confirmAppointment.mockRejectedValue(
      new Error('Appointment is not reserved or does not exist')
    );

    const result = await confirmAppointment({ appointmentId: 'appointment-1' });

    expect(result).toEqual({
      success: false,
      message: 'Appointment is not reserved or does not exist',
    });
  });

  it('cancels appointments through the repository', async () => {
    const appointment = { id: 'appointment-1', slotId: 'slot-1', status: 'cancelled' };
    mockSchedulingRepository.cancelAppointment.mockResolvedValue(appointment);

    const result = await cancelAppointment({ appointmentId: 'appointment-1', reason: 'Tutor pediu' });

    expect(mockSchedulingRepository.cancelAppointment).toHaveBeenCalledWith({
      appointmentId: 'appointment-1',
      reason: 'Tutor pediu',
    });
    expect(result).toEqual({
      success: true,
      appointment,
      message: 'Appointment cancelled',
    });
  });

  it('returns failure when cancellation is rejected', async () => {
    mockSchedulingRepository.cancelAppointment.mockRejectedValue(new Error('Appointment cannot be cancelled'));

    const result = await cancelAppointment({ appointmentId: 'appointment-1' });

    expect(result).toEqual({
      success: false,
      message: 'Appointment cannot be cancelled',
    });
  });

  it('reschedules by cancelling the old appointment and reserving the new slot', async () => {
    const cancelledAppointment = { id: 'appointment-1', slotId: 'slot-1', status: 'cancelled' };
    const newAppointment = { id: 'appointment-2', slotId: 'slot-2', status: 'reserved' };
    mockSchedulingRepository.cancelAppointment.mockResolvedValue(cancelledAppointment);
    mockSchedulingRepository.reserveSlot.mockResolvedValue(newAppointment);

    const result = await rescheduleAppointment({
      appointmentId: 'appointment-1',
      slotId: 'slot-2',
      conversationId: 'conversation-1',
      contactId: 'contact-1',
      reason: 'Tutor pediu novo horario',
    });

    expect(mockSchedulingRepository.cancelAppointment).toHaveBeenCalledWith({
      appointmentId: 'appointment-1',
      reason: 'Tutor pediu novo horario',
    });
    expect(mockSchedulingRepository.reserveSlot).toHaveBeenCalledWith({
      appointmentId: 'appointment-1',
      slotId: 'slot-2',
      conversationId: 'conversation-1',
      contactId: 'contact-1',
      reason: 'Tutor pediu novo horario',
    });
    expect(result).toEqual({
      success: true,
      appointment: newAppointment,
      message: 'Slot reserved temporarily',
    });
  });

  it('does not reserve a new slot when reschedule cancellation fails', async () => {
    mockSchedulingRepository.cancelAppointment.mockRejectedValue(new Error('Appointment cannot be cancelled'));

    const result = await rescheduleAppointment({
      appointmentId: 'appointment-1',
      slotId: 'slot-2',
    });

    expect(mockSchedulingRepository.reserveSlot).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      message: 'Appointment cannot be cancelled',
    });
  });

  it('exports the scheduling tool registry names used by the agent', () => {
    expect(Object.keys(schedulingTools).sort()).toEqual([
      'cancel_appointment',
      'check_available_slots',
      'confirm_appointment',
      'reschedule_appointment',
      'reserve_slot',
    ]);
  });
});
