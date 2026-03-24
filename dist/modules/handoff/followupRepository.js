"use strict";
// Followup Repository - Phase 4
// Uses existing followup_tasks table from Phase 2
Object.defineProperty(exports, "__esModule", { value: true });
exports.followupRepository = exports.FollowupRepository = void 0;
const index_js_1 = require("../../shared/db/index.js");
const index_js_2 = require("../logging/index.js");
function mapRowToFollowup(row) {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        contactId: row.contact_id,
        taskType: row.task_type,
        title: row.title,
        description: row.description,
        dueDate: row.due_date,
        priority: row.priority,
        status: row.status,
        assignedTo: row.assigned_to,
        completedAt: row.completed_at,
        completedBy: row.completed_by,
        createdAt: row.created_at,
    };
}
/**
 * Followup Repository
 */
class FollowupRepository {
    /**
     * Create a new followup task
     */
    async create(input) {
        const sql = `
      INSERT INTO followup_tasks (
        conversation_id, contact_id, task_type, title, description, due_date, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
        const params = [
            input.conversationId || null,
            input.contactId || null,
            input.taskType,
            input.title,
            input.description || null,
            input.dueDate || null,
            input.priority || 'medium',
        ];
        try {
            const result = await (0, index_js_1.query)(sql, params);
            index_js_2.logger.info('Followup task created', { taskId: result.rows[0].id });
            return mapRowToFollowup(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error creating followup task', error, { input });
            throw error;
        }
    }
    /**
     * Find followups by conversation
     */
    async findByConversation(conversationId) {
        const sql = `
      SELECT * FROM followup_tasks 
      WHERE conversation_id = $1
      ORDER BY due_date ASC, created_at DESC
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [conversationId]);
            return result.rows.map(mapRowToFollowup);
        }
        catch (error) {
            index_js_2.logger.error('Error finding followups by conversation', error, { conversationId });
            throw error;
        }
    }
    /**
     * Find pending followups
     */
    async findPending(limit = 50) {
        const sql = `
      SELECT * FROM followup_tasks 
      WHERE status = 'pending'
      ORDER BY 
        CASE priority 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          WHEN 'low' THEN 3 
        END,
        due_date ASC
      LIMIT $1
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [limit]);
            return result.rows.map(mapRowToFollowup);
        }
        catch (error) {
            index_js_2.logger.error('Error finding pending followups', error);
            throw error;
        }
    }
    /**
     * Update followup status
     */
    async updateStatus(id, status, completedBy) {
        const sql = `
      UPDATE followup_tasks 
      SET status = $1,
          completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
          completed_by = CASE WHEN $1 = 'completed' THEN COALESCE($2, completed_by) ELSE completed_by END
      WHERE id = $3
      RETURNING *
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [status, completedBy || null, id]);
            if (result.rows.length === 0) {
                throw new Error('Followup task not found');
            }
            index_js_2.logger.info('Followup task status updated', { taskId: id, status });
            return mapRowToFollowup(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error updating followup status', error, { id, status });
            throw error;
        }
    }
}
exports.FollowupRepository = FollowupRepository;
// Export singleton instance
exports.followupRepository = new FollowupRepository();
//# sourceMappingURL=followupRepository.js.map