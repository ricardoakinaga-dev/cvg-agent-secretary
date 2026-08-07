import { getClient, query } from '../../shared/db';
import { config } from '../../config';
import {
  Appointment,
  AppointmentProvider,
  AppointmentService,
  AppointmentSlot,
  CancelAppointmentInput,
  CheckAvailableSlotsInput,
  CreateAppointmentProviderInput,
  CreateAppointmentServiceInput,
  CreateAppointmentSlotInput,
  ConfirmAppointmentInput,
  RescheduleAppointmentInput,
  ReserveSlotInput,
} from './types';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  requires_human_approval: boolean;
  is_active: boolean;
}

interface ProviderRow {
  id: string;
  name: string;
  sector: string | null;
  is_active: boolean;
}

interface SlotRow {
  id: string;
  service_id: string | null;
  provider_id: string | null;
  starts_at: Date;
  ends_at: Date;
  status: AppointmentSlot['status'];
  metadata?: Record<string, unknown>;
  service_name?: string;
  provider_name?: string;
}

interface AppointmentRow {
  id: string;
  slot_id: string;
  service_id: string | null;
  provider_id: string | null;
  conversation_id: string | null;
  contact_id: string | null;
  pet_id: string | null;
  tutor_name: string | null;
  pet_name: string | null;
  reason: string | null;
  status: Appointment['status'];
  reservation_expires_at: Date | null;
  confirmed_at: Date | null;
  cancelled_at: Date | null;
}

function mapSlot(row: SlotRow): AppointmentSlot {
  return {
    id: row.id,
    serviceId: row.service_id,
    providerId: row.provider_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    serviceName: row.service_name,
    providerName: row.provider_name,
    metadata: row.metadata,
  };
}

function mapService(row: ServiceRow): AppointmentService {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    durationMinutes: row.duration_minutes,
    requiresHumanApproval: row.requires_human_approval,
    isActive: row.is_active,
  };
}

function mapProvider(row: ProviderRow): AppointmentProvider {
  return {
    id: row.id,
    name: row.name,
    sector: row.sector || undefined,
    isActive: row.is_active,
  };
}

function mapAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    slotId: row.slot_id,
    serviceId: row.service_id,
    providerId: row.provider_id,
    conversationId: row.conversation_id || undefined,
    contactId: row.contact_id || undefined,
    petId: row.pet_id || undefined,
    tutorName: row.tutor_name || undefined,
    petName: row.pet_name || undefined,
    reason: row.reason || undefined,
    status: row.status,
    reservationExpiresAt: row.reservation_expires_at || undefined,
    confirmedAt: row.confirmed_at || undefined,
    cancelledAt: row.cancelled_at || undefined,
  };
}

function requireOwnership(
  input: { conversationId?: string; contactId?: string }
): asserts input is { conversationId: string; contactId: string } {
  if (!input.conversationId?.trim() || !input.contactId?.trim()) {
    throw new Error('Appointment ownership context is required');
  }
}

export class SchedulingRepository {
  private async expireReservations(): Promise<void> {
    await query(`
      WITH expired_reservations AS (
        UPDATE appointments
        SET status = 'expired', updated_at = NOW()
        WHERE tenant_id = $1
          AND status = 'reserved'
          AND reservation_expires_at IS NOT NULL
          AND reservation_expires_at <= NOW()
        RETURNING slot_id
      )
      UPDATE appointment_slots AS slots
      SET status = 'available', updated_at = NOW()
      FROM expired_reservations AS expired
      WHERE slots.id = expired.slot_id
        AND slots.tenant_id = $1
        AND slots.status = 'reserved'
    `, [config.chatwoot.accountId]);
  }

  async createService(input: CreateAppointmentServiceInput): Promise<AppointmentService> {
    const result = await query<ServiceRow>(
      `
        INSERT INTO appointment_services (
          tenant_id, name, description, duration_minutes, requires_human_approval
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        config.chatwoot.accountId,
        input.name,
        input.description || null,
        input.durationMinutes || 30,
        input.requiresHumanApproval || false,
      ]
    );

    return mapService(result.rows[0]);
  }

  async listServices(): Promise<AppointmentService[]> {
    const result = await query<ServiceRow>(
      `
        SELECT *
        FROM appointment_services
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY name ASC
      `,
      [config.chatwoot.accountId]
    );

    return result.rows.map(mapService);
  }

  async createProvider(input: CreateAppointmentProviderInput): Promise<AppointmentProvider> {
    const result = await query<ProviderRow>(
      `
        INSERT INTO appointment_providers (tenant_id, name, sector)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [config.chatwoot.accountId, input.name, input.sector || null]
    );

    return mapProvider(result.rows[0]);
  }

  async listProviders(): Promise<AppointmentProvider[]> {
    const result = await query<ProviderRow>(
      `
        SELECT *
        FROM appointment_providers
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY name ASC
      `,
      [config.chatwoot.accountId]
    );

    return result.rows.map(mapProvider);
  }

  async createSlot(input: CreateAppointmentSlotInput): Promise<AppointmentSlot> {
    const result = await query<SlotRow>(
      `
        INSERT INTO appointment_slots (
          tenant_id, service_id, provider_id, starts_at, ends_at, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        config.chatwoot.accountId,
        input.serviceId || null,
        input.providerId || null,
        input.startsAt,
        input.endsAt,
        input.status || 'available',
        JSON.stringify(input.metadata || {}),
      ]
    );

    return mapSlot(result.rows[0]);
  }

  async listSlots(input: {
    from: Date;
    to: Date;
    serviceId?: string;
    providerId?: string;
    status?: AppointmentSlot['status'];
    limit?: number;
  }): Promise<AppointmentSlot[]> {
    await this.expireReservations();

    const params: unknown[] = [config.chatwoot.accountId, input.from, input.to];
    const clauses = [
      's.tenant_id = $1',
      's.starts_at >= $2',
      's.starts_at < $3',
    ];

    if (input.serviceId) {
      params.push(input.serviceId);
      clauses.push(`s.service_id = $${params.length}`);
    }

    if (input.providerId) {
      params.push(input.providerId);
      clauses.push(`s.provider_id = $${params.length}`);
    }

    if (input.status) {
      params.push(input.status);
      clauses.push(`s.status = $${params.length}`);
    }

    params.push(input.limit || 100);

    const result = await query<SlotRow>(
      `
        SELECT s.*, svc.name AS service_name, p.name AS provider_name
        FROM appointment_slots s
        LEFT JOIN appointment_services svc ON svc.id = s.service_id
        LEFT JOIN appointment_providers p ON p.id = s.provider_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY s.starts_at ASC
        LIMIT $${params.length}
      `,
      params
    );

    return result.rows.map(mapSlot);
  }

  async checkAvailableSlots(input: CheckAvailableSlotsInput): Promise<AppointmentSlot[]> {
    await this.expireReservations();

    const params: unknown[] = [
      config.chatwoot.accountId,
      input.from,
      input.to,
      input.limit || 5,
    ];
    const serviceFilter = input.serviceId ? 'AND s.service_id = $5' : '';
    if (input.serviceId) params.push(input.serviceId);

    const result = await query<SlotRow>(
      `
        SELECT s.*, svc.name AS service_name, p.name AS provider_name
        FROM appointment_slots s
        LEFT JOIN appointment_services svc ON svc.id = s.service_id
        LEFT JOIN appointment_providers p ON p.id = s.provider_id
        WHERE s.tenant_id = $1
          AND s.status = 'available'
          AND s.starts_at >= $2
          AND s.starts_at < $3
          ${serviceFilter}
        ORDER BY s.starts_at ASC
        LIMIT $4
      `,
      params
    );

    return result.rows.map(mapSlot);
  }

  async reserveSlot(input: ReserveSlotInput): Promise<Appointment> {
    requireOwnership(input);
    const client = await getClient();
    const holdMinutes = input.holdMinutes || 10;

    try {
      await client.query('BEGIN');

      const slotResult = await client.query<SlotRow>(
        `
          UPDATE appointment_slots
          SET status = 'reserved', updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2 AND status = 'available'
          RETURNING *
        `,
        [input.slotId, config.chatwoot.accountId]
      );

      if (slotResult.rows.length === 0) {
        throw new Error('Slot is not available');
      }

      const slot = slotResult.rows[0];
      const appointmentResult = await client.query<AppointmentRow>(
        `
          INSERT INTO appointments (
            tenant_id, slot_id, service_id, provider_id, conversation_id, contact_id, pet_id,
            tutor_name, pet_name, reason, status, reservation_expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'reserved', NOW() + ($11 || ' minutes')::interval)
          RETURNING *
        `,
        [
          config.chatwoot.accountId,
          slot.id,
          input.serviceId || slot.service_id,
          slot.provider_id,
          input.conversationId || null,
          input.contactId || null,
          input.petId || null,
          input.tutorName || null,
          input.petName || null,
          input.reason || null,
          holdMinutes,
        ]
      );

      await client.query('COMMIT');
      return mapAppointment(appointmentResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async confirmAppointment(input: ConfirmAppointmentInput): Promise<Appointment> {
    requireOwnership(input);
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const appointmentResult = await client.query<AppointmentRow>(
        `
          UPDATE appointments
          SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
          WHERE id = $1
            AND tenant_id = $4
            AND status = 'reserved'
            AND conversation_id = $2
            AND contact_id = $3
          RETURNING *
        `,
        [input.appointmentId, input.conversationId, input.contactId, config.chatwoot.accountId]
      );

      if (appointmentResult.rows.length === 0) {
        throw new Error('Appointment is not reserved or does not belong to this conversation');
      }

      await client.query(
        `UPDATE appointment_slots SET status = 'booked', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [appointmentResult.rows[0].slot_id, config.chatwoot.accountId]
      );

      await client.query('COMMIT');
      return mapAppointment(appointmentResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelAppointment(input: CancelAppointmentInput): Promise<Appointment> {
    requireOwnership(input);
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const appointmentResult = await client.query<AppointmentRow>(
        `
          UPDATE appointments
          SET status = 'cancelled', cancelled_at = NOW(), reason = COALESCE($2, reason), updated_at = NOW()
          WHERE id = $1
            AND tenant_id = $5
            AND status IN ('reserved', 'confirmed')
            AND conversation_id = $3
            AND contact_id = $4
          RETURNING *
        `,
        [
          input.appointmentId,
          input.reason || null,
          input.conversationId,
          input.contactId,
          config.chatwoot.accountId,
        ]
      );

      if (appointmentResult.rows.length === 0) {
        throw new Error('Appointment cannot be cancelled or does not belong to this conversation');
      }

      await client.query(
        `UPDATE appointment_slots SET status = 'available', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [appointmentResult.rows[0].slot_id, config.chatwoot.accountId]
      );

      await client.query('COMMIT');
      return mapAppointment(appointmentResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async rescheduleAppointment(input: RescheduleAppointmentInput): Promise<Appointment> {
    requireOwnership(input);
    const client = await getClient();
    const holdMinutes = input.holdMinutes || 10;

    try {
      await client.query('BEGIN');

      const currentAppointmentResult = await client.query<AppointmentRow>(
        `
          SELECT *
          FROM appointments
          WHERE id = $1
            AND tenant_id = $4
            AND status IN ('reserved', 'confirmed')
            AND conversation_id = $2
            AND contact_id = $3
          FOR UPDATE
        `,
        [input.appointmentId, input.conversationId, input.contactId, config.chatwoot.accountId]
      );

      if (currentAppointmentResult.rows.length === 0) {
        throw new Error('Appointment cannot be rescheduled or does not belong to this conversation');
      }

      const newSlotResult = await client.query<SlotRow>(
        `
          UPDATE appointment_slots
          SET status = 'reserved', updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2 AND status = 'available'
          RETURNING *
        `,
        [input.slotId, config.chatwoot.accountId]
      );

      if (newSlotResult.rows.length === 0) {
        throw new Error('Slot is not available');
      }

      const currentAppointment = currentAppointmentResult.rows[0];
      const newSlot = newSlotResult.rows[0];
      const newAppointmentResult = await client.query<AppointmentRow>(
        `
          INSERT INTO appointments (
            tenant_id, slot_id, service_id, provider_id, conversation_id, contact_id, pet_id,
            tutor_name, pet_name, reason, status, reservation_expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'reserved', NOW() + ($11 || ' minutes')::interval)
          RETURNING *
        `,
        [
          config.chatwoot.accountId,
          newSlot.id,
          input.serviceId || newSlot.service_id,
          newSlot.provider_id,
          input.conversationId,
          input.contactId,
          input.petId || currentAppointment.pet_id,
          input.tutorName || currentAppointment.tutor_name,
          input.petName || currentAppointment.pet_name,
          input.reason || currentAppointment.reason,
          holdMinutes,
        ]
      );

      await client.query(
        `
          UPDATE appointments
          SET status = 'cancelled', cancelled_at = NOW(),
              reason = COALESCE($2, reason), updated_at = NOW()
          WHERE id = $1 AND tenant_id = $3
        `,
        [input.appointmentId, input.reason || null, config.chatwoot.accountId]
      );

      await client.query(
        `UPDATE appointment_slots SET status = 'available', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [currentAppointment.slot_id, config.chatwoot.accountId]
      );

      await client.query('COMMIT');
      return mapAppointment(newAppointmentResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const schedulingRepository = new SchedulingRepository();
