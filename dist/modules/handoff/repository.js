"use strict";
// Handoff Repository - Phase 4
// Based on specs/08_HANDOFF_SYSTEM.md
Object.defineProperty(exports, "__esModule", { value: true });
exports.handoffRepository = exports.HandoffRepository = void 0;
const index_js_1 = require("../../shared/db/index.js");
const index_js_2 = require("../logging/index.js");
/**
 * Map database row to HandoffRecord
 */
function mapRowToHandoff(row) {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        contactId: row.contact_id,
        triggerType: row.trigger_type,
        triggerReason: row.trigger_reason,
        status: row.status,
        priority: row.priority,
        summary: row.summary,
        pendingQuestions: Array.isArray(row.pending_questions) ? row.pending_questions : [],
        whatWasAnswered: row.what_was_answered,
        whatIsMissing: row.what_is_missing,
        riskLevel: row.risk_level,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        resolvedBy: row.resolved_by,
        resolutionNotes: row.resolution_notes,
    };
}
function mapRowToRule(row) {
    return {
        id: row.id,
        ruleType: row.rule_type,
        name: row.name,
        description: row.description,
        content: row.content,
        isActive: row.is_active,
        priority: row.priority,
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
        createdBy: row.created_by,
        createdAt: row.created_at,
    };
}
/**
 * Handoff Repository
 */
class HandoffRepository {
    /**
     * Create a new handoff record
     */
    async create(input) {
        const sql = `
      INSERT INTO handoffs (
        conversation_id, contact_id, trigger_type, trigger_reason,
        priority, summary, pending_questions, what_was_answered, what_is_missing, risk_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
        const params = [
            input.conversationId,
            input.contactId || null,
            input.triggerType,
            input.triggerReason,
            input.priority || 'medium',
            input.summary || null,
            JSON.stringify(input.pendingQuestions || []),
            input.whatWasAnswered || null,
            input.whatIsMissing || null,
            input.riskLevel || 'low',
        ];
        try {
            const result = await (0, index_js_1.query)(sql, params);
            index_js_2.logger.info('Handoff created', { handoffId: result.rows[0].id, conversationId: input.conversationId });
            return mapRowToHandoff(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error creating handoff', error, { input });
            throw error;
        }
    }
    /**
     * Find handoff by conversation ID
     */
    async findByConversation(conversationId) {
        const sql = `
      SELECT * FROM handoffs 
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [conversationId]);
            if (result.rows.length === 0) {
                return null;
            }
            return mapRowToHandoff(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error finding handoff by conversation', error, { conversationId });
            throw error;
        }
    }
    /**
     * Update handoff status
     */
    async updateStatus(id, status, resolvedBy, resolutionNotes) {
        const sql = `
      UPDATE handoffs 
      SET status = $1, 
          completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
          resolved_by = COALESCE($3, resolved_by),
          resolution_notes = COALESCE($4, resolution_notes)
      WHERE id = $5
      RETURNING *
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [status, status, resolvedBy || null, resolutionNotes || null, id]);
            if (result.rows.length === 0) {
                throw new Error('Handoff not found');
            }
            index_js_2.logger.info('Handoff status updated', { handoffId: id, status });
            return mapRowToHandoff(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error updating handoff status', error, { id, status });
            throw error;
        }
    }
    /**
     * Get operational rules by type
     */
    async getOperationalRules(ruleType) {
        let sql = `
      SELECT * FROM operational_rules 
      WHERE is_active = true
    `;
        const params = [];
        if (ruleType) {
            sql += ` AND rule_type = $1`;
            params.push(ruleType);
        }
        sql += ` ORDER BY priority DESC`;
        try {
            const result = await (0, index_js_1.query)(sql, params);
            return result.rows.map(mapRowToRule);
        }
        catch (error) {
            index_js_2.logger.error('Error getting operational rules', error, { ruleType });
            throw error;
        }
    }
    /**
     * Create sector notification
     */
    async createNotification(input) {
        const sql = `
      INSERT INTO sector_notifications (
        sector, conversation_id, contact_id, message, priority
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
        const params = [
            input.sector,
            input.conversationId || null,
            input.contactId || null,
            input.message,
            input.priority || 'medium',
        ];
        try {
            const result = await (0, index_js_1.query)(sql, params);
            index_js_2.logger.info('Sector notification created', { notificationId: result.rows[0].id, sector: input.sector });
            return {
                id: result.rows[0].id,
                sector: result.rows[0].sector,
                conversationId: result.rows[0].conversation_id,
                contactId: result.rows[0].contact_id,
                message: result.rows[0].message,
                priority: result.rows[0].priority,
                status: result.rows[0].status,
                sentAt: result.rows[0].sent_at,
                readAt: result.rows[0].read_at,
                createdAt: result.rows[0].created_at,
            };
        }
        catch (error) {
            index_js_2.logger.error('Error creating notification', error, { input });
            throw error;
        }
    }
    /**
     * Update notification status
     */
    async updateNotificationStatus(id, status) {
        const sql = `
      UPDATE sector_notifications 
      SET status = $1,
          sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE sent_at END,
          read_at = CASE WHEN $1 = 'read' THEN NOW() ELSE read_at END
      WHERE id = $2
    `;
        try {
            await (0, index_js_1.query)(sql, [status, id]);
            index_js_2.logger.info('Notification status updated', { notificationId: id, status });
        }
        catch (error) {
            index_js_2.logger.error('Error updating notification status', error, { id, status });
            throw error;
        }
    }
}
exports.HandoffRepository = HandoffRepository;
// Export singleton instance
exports.handoffRepository = new HandoffRepository();
//# sourceMappingURL=repository.js.map