"use strict";
// Analytics Repository - Database operations for Analytics events
// Phase 6: Persistent Analytics
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRepository = void 0;
const db_1 = require("../../shared/db");
class AnalyticsRepository {
    async createEvent(input) {
        const sql = `
      INSERT INTO analytics_events (
        event_type, conversation_id, contact_id, provider, 
        latency, outcome, metadata, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
        const result = await (0, db_1.query)(sql, [
            input.eventType,
            input.conversationId || null,
            input.contactId || null,
            input.provider || null,
            input.latency || null,
            input.outcome || null,
            JSON.stringify(input.metadata || {}),
            new Date(),
        ]);
        return this.mapRowToEvent(result.rows[0]);
    }
    async getEvents(filters) {
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        if (filters?.eventType) {
            conditions.push(`event_type = $${paramIndex++}`);
            params.push(filters.eventType);
        }
        if (filters?.conversationId) {
            conditions.push(`conversation_id = $${paramIndex++}`);
            params.push(filters.conversationId);
        }
        if (filters?.since) {
            conditions.push(`timestamp >= $${paramIndex++}`);
            params.push(filters.since);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limitClause = filters?.limit ? `LIMIT ${filters.limit}` : 'LIMIT 1000';
        const sql = `
      SELECT * FROM analytics_events
      ${whereClause}
      ORDER BY timestamp DESC
      ${limitClause}
    `;
        const result = await (0, db_1.query)(sql, params);
        return result.rows.map(this.mapRowToEvent);
    }
    async getEventStats(since) {
        const sinceClause = since ? `WHERE timestamp >= $1` : '';
        const params = since ? [since] : [];
        const sql = `
      SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE event_type = 'conversation_started') as conversations_started,
        COUNT(*) FILTER (WHERE event_type = 'conversation_ended') as conversations_ended,
        COUNT(*) FILTER (WHERE event_type = 'handoff_triggered') as handoffs,
        COUNT(*) FILTER (WHERE event_type = 'fallback_triggered') as fallbacks,
        COUNT(*) FILTER (WHERE event_type = 'error_occurred') as errors,
        COALESCE(AVG(latency) FILTER (WHERE event_type = 'response_sent' AND latency IS NOT NULL), 0) as avg_latency
      FROM analytics_events
      ${sinceClause}
    `;
        const result = await (0, db_1.query)(sql, params);
        const row = result.rows[0];
        return {
            totalEvents: parseInt(String(row.total_events), 10),
            conversationsStarted: parseInt(String(row.conversations_started), 10),
            conversationsEnded: parseInt(String(row.conversations_ended), 10),
            handoffs: parseInt(String(row.handoffs), 10),
            fallbacks: parseInt(String(row.fallbacks), 10),
            errors: parseInt(String(row.errors), 10),
            avgResponseLatency: Math.round(parseFloat(String(row.avg_latency))),
        };
    }
    async clearEvents() {
        await (0, db_1.query)('DELETE FROM analytics_events');
    }
    mapRowToEvent(row) {
        return {
            id: row.id,
            eventType: row.event_type,
            conversationId: row.conversation_id || '',
            contactId: row.contact_id,
            provider: row.provider,
            latency: row.latency,
            outcome: row.outcome,
            metadata: row.metadata || {},
            timestamp: new Date(row.timestamp),
        };
    }
}
exports.analyticsRepository = new AnalyticsRepository();
//# sourceMappingURL=repository.js.map