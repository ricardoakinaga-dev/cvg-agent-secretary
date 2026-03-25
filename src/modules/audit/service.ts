// Audit Trail Module - Phase 5A Enterprise
// Records critical system events for governance

import { query } from '../../shared/db';
import { logger } from '../logging';

export type AuditEventType = 
  | 'handoff_triggered'
  | 'knowledge_published'
  | 'knowledge_rejected'
  | 'knowledge_updated'
  | 'ingestion_approved'
  | 'ingestion_rejected'
  | 'user_action'
  | 'system_error'
  | 'config_change'
  | 'login'
  | 'logout'
  | 'role_change';

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  actor: string;
  resourceType: string;
  resourceId: string;
  action: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

export interface CreateAuditEventInput {
  eventType: AuditEventType;
  actor: string;
  resourceType: string;
  resourceId: string;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

class AuditService {
  async recordEvent(input: CreateAuditEventInput): Promise<void> {
    try {
      const sql = `
        INSERT INTO audit_events (
          event_type, actor, resource_type, resource_id, 
          action, details, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await query(sql, [
        input.eventType,
        input.actor,
        input.resourceType,
        input.resourceId,
        input.action,
        JSON.stringify(input.details || {}),
        input.ipAddress || null,
      ]);

      logger.info('Audit event recorded', {
        eventType: input.eventType,
        actor: input.actor,
        resource: `${input.resourceType}:${input.resourceId}`,
      });
    } catch (error) {
      logger.error('Failed to record audit event', error as Error, { input });
      // Don't throw - audit failures shouldn't break the main flow
    }
  }

  async getEvents(filters?: {
    eventType?: AuditEventType;
    actor?: string;
    resourceType?: string;
    since?: Date;
    limit?: number;
  }): Promise<AuditEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
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

    const result = await query(sql, params);
    return result.rows.map(this.mapRowToEvent);
  }

  private mapRowToEvent(row: Record<string, unknown>): AuditEvent {
    return {
      id: row.id as string,
      eventType: row.event_type as AuditEventType,
      actor: row.actor as string,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string,
      action: row.action as string,
      details: (row.details as Record<string, unknown>) || {},
      ipAddress: row.ip_address as string | undefined,
      createdAt: new Date(row.created_at as string),
    };
  }
}

export const auditService = new AuditService();
