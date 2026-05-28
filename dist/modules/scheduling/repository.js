"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulingRepository = exports.SchedulingRepository = void 0;
const db_1 = require("../../shared/db");
function mapSlot(row) {
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
function mapService(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description || undefined,
        durationMinutes: row.duration_minutes,
        requiresHumanApproval: row.requires_human_approval,
        isActive: row.is_active,
    };
}
function mapProvider(row) {
    return {
        id: row.id,
        name: row.name,
        sector: row.sector || undefined,
        isActive: row.is_active,
    };
}
function mapAppointment(row) {
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
class SchedulingRepository {
    async createService(input) {
        const result = await (0, db_1.query)(`
        INSERT INTO appointment_services (
          name, description, duration_minutes, requires_human_approval
        ) VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [
            input.name,
            input.description || null,
            input.durationMinutes || 30,
            input.requiresHumanApproval || false,
        ]);
        return mapService(result.rows[0]);
    }
    async listServices() {
        const result = await (0, db_1.query)(`
        SELECT *
        FROM appointment_services
        WHERE is_active = true
        ORDER BY name ASC
      `);
        return result.rows.map(mapService);
    }
    async createProvider(input) {
        const result = await (0, db_1.query)(`
        INSERT INTO appointment_providers (name, sector)
        VALUES ($1, $2)
        RETURNING *
      `, [input.name, input.sector || null]);
        return mapProvider(result.rows[0]);
    }
    async listProviders() {
        const result = await (0, db_1.query)(`
        SELECT *
        FROM appointment_providers
        WHERE is_active = true
        ORDER BY name ASC
      `);
        return result.rows.map(mapProvider);
    }
    async createSlot(input) {
        const result = await (0, db_1.query)(`
        INSERT INTO appointment_slots (
          service_id, provider_id, starts_at, ends_at, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
            input.serviceId || null,
            input.providerId || null,
            input.startsAt,
            input.endsAt,
            input.status || 'available',
            JSON.stringify(input.metadata || {}),
        ]);
        return mapSlot(result.rows[0]);
    }
    async listSlots(input) {
        const params = [input.from, input.to];
        const clauses = [
            's.starts_at >= $1',
            's.starts_at < $2',
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
        const result = await (0, db_1.query)(`
        SELECT s.*, svc.name AS service_name, p.name AS provider_name
        FROM appointment_slots s
        LEFT JOIN appointment_services svc ON svc.id = s.service_id
        LEFT JOIN appointment_providers p ON p.id = s.provider_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY s.starts_at ASC
        LIMIT $${params.length}
      `, params);
        return result.rows.map(mapSlot);
    }
    async checkAvailableSlots(input) {
        const params = [input.from, input.to, input.limit || 5];
        const serviceFilter = input.serviceId ? 'AND s.service_id = $4' : '';
        if (input.serviceId)
            params.push(input.serviceId);
        const result = await (0, db_1.query)(`
        SELECT s.*, svc.name AS service_name, p.name AS provider_name
        FROM appointment_slots s
        LEFT JOIN appointment_services svc ON svc.id = s.service_id
        LEFT JOIN appointment_providers p ON p.id = s.provider_id
        WHERE s.status = 'available'
          AND s.starts_at >= $1
          AND s.starts_at < $2
          ${serviceFilter}
        ORDER BY s.starts_at ASC
        LIMIT $3
      `, params);
        return result.rows.map(mapSlot);
    }
    async reserveSlot(input) {
        const client = await (0, db_1.getClient)();
        const holdMinutes = input.holdMinutes || 10;
        try {
            await client.query('BEGIN');
            const slotResult = await client.query(`
          UPDATE appointment_slots
          SET status = 'reserved', updated_at = NOW()
          WHERE id = $1 AND status = 'available'
          RETURNING *
        `, [input.slotId]);
            if (slotResult.rows.length === 0) {
                throw new Error('Slot is not available');
            }
            const slot = slotResult.rows[0];
            const appointmentResult = await client.query(`
          INSERT INTO appointments (
            slot_id, service_id, provider_id, conversation_id, contact_id, pet_id,
            tutor_name, pet_name, reason, status, reservation_expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reserved', NOW() + ($10 || ' minutes')::interval)
          RETURNING *
        `, [
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
            ]);
            await client.query('COMMIT');
            return mapAppointment(appointmentResult.rows[0]);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async confirmAppointment(input) {
        const client = await (0, db_1.getClient)();
        try {
            await client.query('BEGIN');
            const appointmentResult = await client.query(`
          UPDATE appointments
          SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'reserved'
          RETURNING *
        `, [input.appointmentId]);
            if (appointmentResult.rows.length === 0) {
                throw new Error('Appointment is not reserved or does not exist');
            }
            await client.query(`UPDATE appointment_slots SET status = 'booked', updated_at = NOW() WHERE id = $1`, [appointmentResult.rows[0].slot_id]);
            await client.query('COMMIT');
            return mapAppointment(appointmentResult.rows[0]);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async cancelAppointment(input) {
        const client = await (0, db_1.getClient)();
        try {
            await client.query('BEGIN');
            const appointmentResult = await client.query(`
          UPDATE appointments
          SET status = 'cancelled', cancelled_at = NOW(), reason = COALESCE($2, reason), updated_at = NOW()
          WHERE id = $1 AND status IN ('reserved', 'confirmed')
          RETURNING *
        `, [input.appointmentId, input.reason || null]);
            if (appointmentResult.rows.length === 0) {
                throw new Error('Appointment cannot be cancelled');
            }
            await client.query(`UPDATE appointment_slots SET status = 'available', updated_at = NOW() WHERE id = $1`, [appointmentResult.rows[0].slot_id]);
            await client.query('COMMIT');
            return mapAppointment(appointmentResult.rows[0]);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
}
exports.SchedulingRepository = SchedulingRepository;
exports.schedulingRepository = new SchedulingRepository();
//# sourceMappingURL=repository.js.map