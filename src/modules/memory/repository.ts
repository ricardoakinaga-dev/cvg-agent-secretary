import { query } from '../../shared/db/index.js';
import { logger } from '../logging/index.js';
import { 
  Memory, 
  CreateMemoryInput, 
  UpdateMemoryInput, 
  MemorySearchInput,
  MemoryRow,
  mapRowToMemory,
  VALID_CATEGORIES,
  VALID_SOURCES,
  CONFIDENCE_THRESHOLDS
} from './types.js';

export class MemoryRepository {
  
  /**
   * List memories by various search criteria
   */
  async find(input: MemorySearchInput): Promise<Memory[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
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
      const result = await query<MemoryRow>(sql, params);
      return result.rows.map(mapRowToMemory);
    } catch (error) {
      logger.error('Error finding memories', error as Error, { input });
      throw error;
    }
  }

  /**
   * Find a memory by ID
   */
  async findById(id: string): Promise<Memory | null> {
    const sql = `
      SELECT * FROM customer_memories 
      WHERE id = $1
    `;

    try {
      const result = await query<MemoryRow>(sql, [id]);
      if (result.rows.length === 0) {
        return null;
      }
      return mapRowToMemory(result.rows[0]);
    } catch (error) {
      logger.error('Error finding memory by ID', error as Error, { id });
      throw error;
    }
  }

  /**
   * Create a new memory
   * Note: Will deactivate conflicting facts with same contact+category+key
   */
  async create(input: CreateMemoryInput): Promise<Memory> {
    // Validate category
    if (!VALID_CATEGORIES.includes(input.category)) {
      throw new Error(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    // Validate source
    if (!VALID_SOURCES.includes(input.source)) {
      throw new Error(`Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}`);
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
      const existing = await query(existingSql, [
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
        await query(deactivateSql, [existing.rows[0].id]);
        logger.info('Deactivated conflicting memory', { 
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
        input.confidence >= CONFIDENCE_THRESHOLDS.AUTO_SAVE ? new Date() : null,
      ];

      const result = await query<MemoryRow>(sql, params);
      logger.info('Memory created', { memoryId: result.rows[0].id });
      return mapRowToMemory(result.rows[0]);
    } catch (error) {
      logger.error('Error creating memory', error as Error, { input });
      throw error;
    }
  }

  /**
   * Update an existing memory
   */
  async update(id: string, input: UpdateMemoryInput): Promise<Memory> {
    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const updateField = (field: string, value: unknown) => {
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
      if (!VALID_SOURCES.includes(input.source)) {
        throw new Error(`Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}`);
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
      logger.warn('MemoryRepository.update called with no fields to update', { id });
      return this.findById(id) as Promise<Memory>;
    }

    const sql = `
      UPDATE customer_memories 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++}
      RETURNING *
    `;
    params.push(id);

    try {
      const result = await query<MemoryRow>(sql, params);
      if (result.rows.length === 0) {
        throw new Error('Memory not found');
      }
      logger.info('Memory updated', { memoryId: id });
      return mapRowToMemory(result.rows[0]);
    } catch (error) {
      logger.error('Error updating memory', error as Error, { id, input });
      throw error;
    }
  }

  /**
   * Deactivate a memory (soft delete)
   */
  async deactivate(id: string): Promise<void> {
    const sql = `
      UPDATE customer_memories 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
    `;

    try {
      const result = await query(sql, [id]);
      if (result.rowCount === 0) {
        logger.warn('Memory not found for deactivation', { id });
      } else {
        logger.info('Memory deactivated', { memoryId: id });
      }
    } catch (error) {
      logger.error('Error deactivating memory', error as Error, { id });
      throw error;
    }
  }

  /**
   * Get memories for a contact formatted for LLM context
   */
  async getContextForLLM(contactId: string): Promise<string[]> {
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

// Export singleton instance
export const memoryRepository = new MemoryRepository();