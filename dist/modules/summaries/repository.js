"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryRepository = exports.SummaryRepository = void 0;
const index_js_1 = require("../../shared/db/index.js");
const index_js_2 = require("../logging/index.js");
const types_js_1 = require("./types.js");
class SummaryRepository {
    /**
     * Find summary by conversation ID
     */
    async findByConversation(conversationId) {
        const sql = `
      SELECT * FROM conversation_summaries 
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [conversationId]);
            if (result.rows.length === 0) {
                return null;
            }
            return (0, types_js_1.mapRowToSummary)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error finding summary by conversation', error, { conversationId });
            throw error;
        }
    }
    /**
     * Create a new summary
     */
    async create(input) {
        const sql = `
      INSERT INTO conversation_summaries (
        conversation_id, summary_text, key_points, extracted_facts,
        intent, sentiment, needs_handoff, handoff_reason, generated_by, model_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
        const params = [
            input.conversationId,
            input.summaryText,
            JSON.stringify(input.keyPoints || []),
            JSON.stringify(input.extractedFacts || []),
            input.intent || null,
            input.sentiment || null,
            input.needsHandoff || false,
            input.handoffReason || null,
            input.generatedBy || 'openai',
            input.modelVersion || null,
        ];
        try {
            const result = await (0, index_js_1.query)(sql, params);
            index_js_2.logger.info('Conversation summary created', {
                summaryId: result.rows[0].id,
                conversationId: input.conversationId
            });
            return (0, types_js_1.mapRowToSummary)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error creating summary', error, { input });
            throw error;
        }
    }
    /**
     * Update existing summary
     */
    async update(id, input) {
        const fields = [];
        const params = [];
        let paramIndex = 1;
        const updateField = (field, value) => {
            if (value !== undefined) {
                fields.push(`${field} = $${paramIndex++}`);
                params.push(value);
            }
        };
        updateField('summary_text', input.summaryText);
        if (input.keyPoints) {
            updateField('key_points', JSON.stringify(input.keyPoints));
        }
        if (input.extractedFacts) {
            updateField('extracted_facts', JSON.stringify(input.extractedFacts));
        }
        updateField('intent', input.intent);
        updateField('sentiment', input.sentiment);
        updateField('needs_handoff', input.needsHandoff);
        updateField('handoff_reason', input.handoffReason);
        if (fields.length === 0) {
            throw new Error('No fields to update');
        }
        const sql = `
      UPDATE conversation_summaries 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++}
      RETURNING *
    `;
        params.push(id);
        try {
            const result = await (0, index_js_1.query)(sql, params);
            if (result.rows.length === 0) {
                throw new Error('Summary not found');
            }
            index_js_2.logger.info('Conversation summary updated', { summaryId: id });
            return (0, types_js_1.mapRowToSummary)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error updating summary', error, { id, input });
            throw error;
        }
    }
    /**
     * List summaries for a contact (across all their conversations)
     */
    async findByContact(contactId, limit = 10) {
        const sql = `
      SELECT cs.* FROM conversation_summaries cs
      JOIN conversations c ON cs.conversation_id = c.id
      WHERE c.chatwoot_contact_id = $1
      ORDER BY cs.created_at DESC
      LIMIT $2
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [contactId, limit]);
            return result.rows.map(types_js_1.mapRowToSummary);
        }
        catch (error) {
            index_js_2.logger.error('Error finding summaries by contact', error, { contactId });
            throw error;
        }
    }
}
exports.SummaryRepository = SummaryRepository;
// Export singleton instance
exports.summaryRepository = new SummaryRepository();
//# sourceMappingURL=repository.js.map