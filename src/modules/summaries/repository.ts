import { query } from '../../shared/db/index.js';
import { config } from '../../config/index.js';
import { logger } from '../logging/index.js';
import { 
  ConversationSummary, 
  CreateSummaryInput, 
  SummaryRow,
  mapRowToSummary 
} from './types.js';

export class SummaryRepository {
  
  /**
   * Find summary by conversation ID
   */
  async findByConversation(conversationId: string): Promise<ConversationSummary | null> {
    const sql = `
      SELECT * FROM conversation_summaries 
      WHERE tenant_id = $1 AND conversation_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `;

    try {
      const result = await query<SummaryRow>(sql, [config.chatwoot.accountId, conversationId]);
      if (result.rows.length === 0) {
        return null;
      }
      return mapRowToSummary(result.rows[0]);
    } catch (error) {
      logger.error('Error finding summary by conversation', error as Error, { conversationId });
      throw error;
    }
  }

  /**
   * Create a new summary
   */
  async create(input: CreateSummaryInput): Promise<ConversationSummary> {
    const sql = `
      INSERT INTO conversation_summaries (
        tenant_id, conversation_id, summary_text, key_points, extracted_facts,
        intent, sentiment, needs_handoff, handoff_reason, generated_by, model_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const params = [
      config.chatwoot.accountId,
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
      const result = await query<SummaryRow>(sql, params);
      logger.info('Conversation summary created', { 
        summaryId: result.rows[0].id,
        conversationId: input.conversationId 
      });
      return mapRowToSummary(result.rows[0]);
    } catch (error) {
      logger.error('Error creating summary', error as Error, { input });
      throw error;
    }
  }

  /**
   * Update existing summary
   */
  async update(
    id: string, 
    input: Partial<CreateSummaryInput>
  ): Promise<ConversationSummary> {
    const fields: string[] = [];
    const params: unknown[] = [config.chatwoot.accountId];
    let paramIndex = 2;

    const updateField = (field: string, value: unknown) => {
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
      WHERE tenant_id = $1 AND id = $${paramIndex++}
      RETURNING *
    `;
    params.push(id);

    try {
      const result = await query<SummaryRow>(sql, params);
      if (result.rows.length === 0) {
        throw new Error('Summary not found');
      }
      logger.info('Conversation summary updated', { summaryId: id });
      return mapRowToSummary(result.rows[0]);
    } catch (error) {
      logger.error('Error updating summary', error as Error, { id, input });
      throw error;
    }
  }

  /**
   * List summaries for a contact (across all their conversations)
   */
  async findByContact(contactId: string, limit: number = 10): Promise<ConversationSummary[]> {
    const sql = `
      SELECT cs.* FROM conversation_summaries cs
      JOIN conversations c ON c.tenant_id = cs.tenant_id AND c.id = cs.conversation_id
      WHERE cs.tenant_id = $1 AND c.chatwoot_contact_id = $2
      ORDER BY cs.created_at DESC
      LIMIT $3
    `;

    try {
      const result = await query<SummaryRow>(sql, [config.chatwoot.accountId, contactId, limit]);
      return result.rows.map(mapRowToSummary);
    } catch (error) {
      logger.error('Error finding summaries by contact', error as Error, { contactId });
      throw error;
    }
  }
}

// Export singleton instance
export const summaryRepository = new SummaryRepository();
