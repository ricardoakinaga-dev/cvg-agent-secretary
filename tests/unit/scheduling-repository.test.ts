const mockQuery = vi.hoisted(() => vi.fn());
const mockClient = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
}));
const mockGetClient = vi.hoisted(() => vi.fn(async () => mockClient));

vi.mock('../../src/shared/db', () => ({
  query: mockQuery,
  getClient: mockGetClient,
}));

import { SchedulingRepository } from '../../src/modules/scheduling/repository';

function slotRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'slot-1',
    service_id: 'service-1',
    provider_id: 'provider-1',
    starts_at: new Date('2026-06-01T13:00:00.000Z'),
    ends_at: new Date('2026-06-01T13:30:00.000Z'),
    status: 'available',
    metadata: { room: '1' },
    service_name: 'Consulta',
    provider_name: 'Dra Ana',
    ...overrides,
  };
}

function appointmentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'appointment-1',
    slot_id: 'slot-1',
    service_id: 'service-1',
    provider_id: 'provider-1',
    conversation_id: 'conversation-1',
    contact_id: 'contact-1',
    pet_id: null,
    tutor_name: 'Maria',
    pet_name: 'Buddy',
    reason: 'Consulta',
    status: 'reserved',
    reservation_expires_at: new Date('2026-06-01T12:50:00.000Z'),
    confirmed_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

describe('scheduling repository', () => {
  let repository: SchedulingRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new SchedulingRepository();
  });

  it('creates appointment services', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 'service-1',
        name: 'Consulta',
        description: 'Consulta clinica',
        duration_minutes: 30,
        requires_human_approval: false,
        is_active: true,
      }],
    });

    const service = await repository.createService({
      name: 'Consulta',
      description: 'Consulta clinica',
      durationMinutes: 30,
    });

    expect(service).toEqual({
      id: 'service-1',
      name: 'Consulta',
      description: 'Consulta clinica',
      durationMinutes: 30,
      requiresHumanApproval: false,
      isActive: true,
    });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO appointment_services'), [
      'Consulta',
      'Consulta clinica',
      30,
      false,
    ]);
  });

  it('uses defaults when creating services, providers and slots', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'service-1',
          name: 'Banho',
          description: null,
          duration_minutes: 30,
          requires_human_approval: false,
          is_active: true,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'provider-1', name: 'Equipe banho', sector: null, is_active: true }],
      })
      .mockResolvedValueOnce({ rows: [slotRow({ service_id: null, provider_id: null, status: 'available' })] });

    const service = await repository.createService({ name: 'Banho' });
    const provider = await repository.createProvider({ name: 'Equipe banho' });
    const slot = await repository.createSlot({
      startsAt: new Date('2026-06-01T13:00:00.000Z'),
      endsAt: new Date('2026-06-01T13:30:00.000Z'),
    });

    expect(service.description).toBeUndefined();
    expect(provider.sector).toBeUndefined();
    expect(slot.status).toBe('available');
    expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO appointment_services'), [
      'Banho',
      null,
      30,
      false,
    ]);
    expect(mockQuery).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO appointment_slots'), [
      null,
      null,
      new Date('2026-06-01T13:00:00.000Z'),
      new Date('2026-06-01T13:30:00.000Z'),
      'available',
      '{}',
    ]);
  });

  it('lists providers and slots with filters', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'provider-1', name: 'Dra Ana', sector: 'clinica', is_active: true }],
      })
      .mockResolvedValueOnce({ rows: [slotRow()] });

    const providers = await repository.listProviders();
    const slots = await repository.listSlots({
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-02T00:00:00.000Z'),
      serviceId: 'service-1',
      providerId: 'provider-1',
      status: 'available',
      limit: 10,
    });

    expect(providers[0]).toEqual({
      id: 'provider-1',
      name: 'Dra Ana',
      sector: 'clinica',
      isActive: true,
    });
    expect(slots[0]).toEqual(expect.objectContaining({
      id: 'slot-1',
      serviceId: 'service-1',
      providerId: 'provider-1',
      status: 'available',
      metadata: { room: '1' },
    }));
    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('FROM appointment_slots s'),
      [
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-06-02T00:00:00.000Z'),
        'service-1',
        'provider-1',
        'available',
        10,
      ]
    );
  });

  it('checks available slots with service filtering', async () => {
    mockQuery.mockResolvedValue({ rows: [slotRow()] });

    const slots = await repository.checkAvailableSlots({
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-02T00:00:00.000Z'),
      serviceId: 'service-1',
      limit: 5,
    });

    expect(slots).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('AND s.service_id = $4'),
      [
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-06-02T00:00:00.000Z'),
        5,
        'service-1',
      ]
    );
  });

  it('reserves slots transactionally', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [slotRow()] })
      .mockResolvedValueOnce({ rows: [appointmentRow()] })
      .mockResolvedValueOnce({});

    const appointment = await repository.reserveSlot({
      slotId: 'slot-1',
      conversationId: 'conversation-1',
      contactId: 'contact-1',
      tutorName: 'Maria',
      petName: 'Buddy',
      reason: 'Consulta',
      holdMinutes: 15,
    });

    expect(appointment.status).toBe('reserved');
    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('rolls back when reserving an unavailable slot', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    await expect(repository.reserveSlot({ slotId: 'slot-1' }))
      .rejects
      .toThrow('Slot is not available');

    expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('confirms appointments transactionally', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [appointmentRow({ status: 'confirmed', confirmed_at: new Date('2026-06-01T12:40:00.000Z') })],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const appointment = await repository.confirmAppointment({ appointmentId: 'appointment-1' });

    expect(appointment.status).toBe('confirmed');
    expect(mockClient.query).toHaveBeenNthCalledWith(
      3,
      'UPDATE appointment_slots SET status = \'booked\', updated_at = NOW() WHERE id = $1',
      ['slot-1']
    );
    expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('cancels appointments and releases slots', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [appointmentRow({ status: 'cancelled', cancelled_at: new Date('2026-06-01T12:40:00.000Z') })],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const appointment = await repository.cancelAppointment({
      appointmentId: 'appointment-1',
      reason: 'Tutor pediu cancelamento',
    });

    expect(appointment.status).toBe('cancelled');
    expect(mockClient.query).toHaveBeenNthCalledWith(
      3,
      'UPDATE appointment_slots SET status = \'available\', updated_at = NOW() WHERE id = $1',
      ['slot-1']
    );
    expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
  });
});
