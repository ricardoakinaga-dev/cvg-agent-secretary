"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryRepository = exports.MemoryRepository = void 0;
const index_js_1 = require("../../shared/db/index.js");
const index_js_2 = require("../logging/index.js");
const types_js_1 = require("./types.js");
class MemoryRepository {
    /**
     * List memories by various search criteria
     */
    async find(input) {
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        conditions.push('contact_id = $' + paramIndex++);
        params.push(input.contactId);
        if (input.petId) {
            conditions.push('pet_id = $' + paramIndex++);
            params.push(input.petId);
        }
        if (input.category) {
            conditions.push('category = $' + paramIndex++);
            params.push(input.category);
        }
        if (input.key) {
            conditions.push('key = $' + paramIndex++);
            params.push(input.key);
        }
        if (input.activeOnly !== false) {
            conditions.push('is_active = true');
        }
        const sql = `
      SELECT * FROM customer_memories 
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC
    `;
        try {
            const result = await (0, index_js_1.query)(sql, params);
            return result.rows.map(types_js_1.mapRowToMemory);
        }
        catch (error) {
            index_js_2.logger.error('Error finding memories', error, { input });
            throw error;
        }
    }
    /**
     * Find a memory by ID
     */
    async findById(id) {
        const sql = `
      SELECT * FROM customer_memories 
      WHERE id = $1
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [id]);
            if (result.rows.length === 0) {
                return null;
            }
            return (0, types_js_1.mapRowToMemory)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error finding memory by ID', error, { id });
            throw error;
        }
    }
    /**
     * Create a new memory
     * Note: Will deactivate conflicting facts with same contact+category+key
     */
    async create(input) {
        // Validate category
        if (!types_js_1.VALID_CATEGORIES.includes(input.category)) {
            throw new Error(`Invalid category. Must be one of: ${types_js_1.VALID_CATEGORIES.join(', ')}`);
        }
        // Validate source
        if (!types_js_1.VALID_SOURCES.includes(input.source)) {
            throw new Error(`Invalid source. Must be one of: ${types_js_1.VALID_SOURCES.join(', ')}`);
        }
        // Validate confidence
        if (input.confidence < 0 || input.confidence > 1) {
            throw new Error('Confidence must be between 0 and 1');
        }
        // Check for existing fact with same contact+category+key
        const existingSql = `
      SELECT id FROM customer_memories 
      WHERE contact_id = $1 AND category = $2 AND key = $3 AND is_active = true
    `;
        try {
            const existing = await (0, index_js_1.query)(existingSql, [
                input.contactId,
                input.category,
                input.key
            ]);
            // If exists, deactivate it (for conflict handling)
            if (existing.rows.length > 0) {
                const deactivateSql = `
          UPDATE customer_memories 
          SET is_active = false, updated_at = NOW()
          WHERE id = $1
        `;
                await (0, index_js_1.query)(deactivateSql, [existing.rows[0].id]);
                index_js_2.logger.info('Deactivated conflicting memory', {
                    oldId: existing.rows[0].id,
                    newKey: input.key
                });
            }
            // Create new memory
            const sql = `
        INSERT INTO customer_memories (
          contact_id, pet_id, conversation_id, category, key, value, 
          confidence, source, is_active, last_confirmed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
            const params = [
                input.contactId,
                input.petId || null,
                input.conversationId || null,
                input.category,
                input.key,
                JSON.stringify(input.value),
                input.confidence,
                input.source,
                true,
                input.confidence >= types_js_1.CONFIDENCE_THRESHOLDS.AUTO_SAVE ? new Date() : null,
            ];
            const result = await (0, index_js_1.query)(sql, params);
            index_js_2.logger.info('Memory created', { memoryId: result.rows[0].id });
            return (0, types_js_1.mapRowToMemory)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error creating memory', error, { input });
            throw error;
        }
    }
    /**
     * Update an existing memory
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
        if (input.value !== undefined) {
            updateField('value', JSON.stringify(input.value));
        }
        if (input.confidence !== undefined) {
            if (input.confidence < 0 || input.confidence > 1) {
                throw new Error('Confidence must be between 0 and 1');
            }
            updateField('confidence', input.confidence);
        }
        if (input.source !== undefined) {
            if (!types_js_1.VALID_SOURCES.includes(input.source)) {
                throw new Error(`Invalid source. Must be one of: ${types_js_1.VALID_SOURCES.join(', ')}`);
            }
            updateField('source', input.source);
        }
        if (input.isActive !== undefined) {
            updateField('is_active', input.isActive);
        }
        if (input.lastConfirmedAt !== undefined) {
            updateField('last_confirmed_at', input.lastConfirmedAt);
        }
        if (fields.length === 0) {
            index_js_2.logger.warn('MemoryRepository.update called with no fields to update', { id });
            return this.findById(id);
        }
        const sql = `
      UPDATE customer_memories 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++}
      RETURNING *
    `;
        params.push(id);
        try {
            const result = await (0, index_js_1.query)(sql, params);
            if (result.rows.length === 0) {
                throw new Error('Memory not found');
            }
            index_js_2.logger.info('Memory updated', { memoryId: id });
            return (0, types_js_1.mapRowToMemory)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error updating memory', error, { id, input });
            throw error;
        }
    }
    /**
     * Deactivate a memory (soft delete)
     */
    async deactivate(id) {
        const sql = `
      UPDATE customer_memories 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [id]);
            if (result.rowCount === 0) {
                index_js_2.logger.warn('Memory not found for deactivation', { id });
            }
            else {
                index_js_2.logger.info('Memory deactivated', { memoryId: id });
            }
        }
        catch (error) {
            index_js_2.logger.error('Error deactivating memory', error, { id });
            throw error;
        }
    }
    /**
     * Get memories for a contact formatted for LLM context
     */
    async getContextForLLM(contactId) {
        const memories = await this.find({
            contactId,
            activeOnly: true
        });
        return memories.map(m => {
            const valueStr = typeof m.value === 'object'
                ? JSON.stringify(m.value)
                : m.value;
            return `[${m.category}] ${m.key}: ${valueStr} (confiança: ${m.confidence.toFixed(2)})`;
        });
    }
}
exports.MemoryRepository = MemoryRepository;
// Export singleton instance
exports.memoryRepository = new MemoryRepository();
//# sourceMappingURL=repository.js.map