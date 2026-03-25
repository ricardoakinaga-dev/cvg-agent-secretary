"use strict";
// Audit Trail Module - Phase 5A Enterprise
// Records critical system events for governance
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditService = void 0;
const db_1 = require("../../shared/db");
const logging_1 = require("../logging");
class AuditService {
    async recordEvent(input) {
        try {
            const sql = `
        INSERT INTO audit_events (
          event_type, actor, resource_type, resource_id, 
          action, details, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
            await (0, db_1.query)(sql, [
                input.eventType,
                input.actor,
                input.resourceType,
                input.resourceId,
                input.action,
                JSON.stringify(input.details || {}),
                input.ipAddress || null,
            ]);
            logging_1.logger.info('Audit event recorded', {
                eventType: input.eventType,
                actor: input.actor,
                resource: `${input.resourceType}:${input.resourceId}`,
            });
        }
        catch (error) {
            logging_1.logger.error('Failed to record audit event', error, { input });
            // Don't throw - audit failures shouldn't break the main flow
        }
    }
    async getEvents(filters) {
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        if (filters?.eventType) {
            conditions.push(`event_type = $${paramIndex++}`);
            params.push(filters.eventType);
        }
        if (filters?.actor) {
            conditions.push(`actor = $${paramIndex++}`);
            params.push(filters.actor);
        }
        if (filters?.resourceType) {
            conditions.push(`resource_type = $${paramIndex++}`);
            params.push(filters.resourceType);
        }
        if (filters?.since) {
            conditions.push(`created_at >= $${paramIndex++}`);
            params.push(filters.since);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = filters?.limit || 100;
        const sql = `
      SELECT * FROM audit_events
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
        const result = await (0, db_1.query)(sql, params);
        return result.rows.map(this.mapRowToEvent);
    }
    mapRowToEvent(row) {
        return {
            id: row.id,
            eventType: row.event_type,
            actor: row.actor,
            resourceType: row.resource_type,
            resourceId: row.resource_id,
            action: row.action,
            details: row.details || {},
            ipAddress: row.ip_address,
            createdAt: new Date(row.created_at),
        };
    }
}
exports.auditService = new AuditService();
//# sourceMappingURL=service.js.map