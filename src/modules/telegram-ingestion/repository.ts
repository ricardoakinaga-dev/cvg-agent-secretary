// Telegram Ingestion Repository
// Phase 5: Database operations for telegram_ingestions and operational_rules

import { query } from '../../shared/db';
import {
  TelegramIngestion,
  CreateTelegramIngestionInput,
  IngestionStatus,
  TelegramContentType,
  OperationalRule,
  CreateOperationalRuleInput,
} from './types';

/**
 * Telegram Ingestion Repository
 * Handles database operations for telegram_ingestions and operational_rules
 */
class TelegramIngestionRepository {
  /**
   * Create a new telegram ingestion record
   */
  async create(input: CreateTelegramIngestionInput): Promise<TelegramIngestion> {
    const sql = `
      INSERT INTO telegram_ingestions (
        telegram_chat_id,
        telegram_message_id,
        source,
        raw_content,
        title,
        status,
        content_length,
        tags,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await query(sql, [
      input.telegramChatId || null,
      input.telegramMessageId || null,
      input.source || 'telegram',
      input.rawContent,
      input.title || null,
      'pending',
      input.rawContent.length,
      JSON.stringify([]),
      JSON.stringify({}),
    ]);

    return this.mapRowToIngestion(result.rows[0]);
  }

  /**
   * Update ingestion with classification results
   */
  async updateWithClassification(
    id: string,
    classifiedType: TelegramContentType,
    confidence: number,
    title: string,
    tags: string[],
    destination: string,
    targetTable: string,
    status: IngestionStatus
  ): Promise<TelegramIngestion> {
    const sql = `
      UPDATE telegram_ingestions
      SET classified_type = $2,
          classification_confidence = $3,
          title = $4,
          tags = $5,
          destination = $6,
          target_table = $7,
          status = $8,
          updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `;

    const result = await query(sql, [
      id,
      classifiedType,
      confidence,
      title,
      JSON.stringify(tags),
      destination,
      targetTable,
      status,
      id,
    ]);

    if (result.rows.length === 0) {
      throw new Error(`Ingestion not found: ${id}`);
    }

    return this.mapRowToIngestion(result.rows[0]);
  }

  /**
   * Update ingestion status
   */
  async updateStatus(
    id: string,
    status: IngestionStatus,
    processedBy?: string,
    knowledgeDocumentId?: string,
    validationErrors?: string[]
  ): Promise<TelegramIngestion> {
    const updates: string[] = ['status = $2', 'updated_at = NOW()'];
    const values: unknown[] = [id, status];
    let paramIndex = 3;

    if (processedBy) {
      updates.push(`processed_by = $${paramIndex++}`);
      values.push(processedBy);
      updates.push(`processed_at = NOW()`);
    }

    if (knowledgeDocumentId) {
      updates.push(`knowledge_document_id = $${paramIndex++}`);
      values.push(knowledgeDocumentId);
    }

    if (validationErrors) {
      updates.push(`validation_errors = $${paramIndex++}`);
      values.push(JSON.stringify(validationErrors));
    }

    const sql = `
      UPDATE telegram_ingestions
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      throw new Error(`Ingestion not found: ${id}`);
    }

    return this.mapRowToIngestion(result.rows[0]);
  }

  /**
   * Approve an ingestion
   */
  async approve(id: string, approvedBy: string): Promise<TelegramIngestion> {
    const sql = `
      UPDATE telegram_ingestions
      SET status = 'approved',
          approved_by = $2,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [id, approvedBy]);

    if (result.rows.length === 0) {
      throw new Error(`Ingestion not found: ${id}`);
    }

    return this.mapRowToIngestion(result.rows[0]);
  }

  /**
   * Reject an ingestion
   */
  async reject(id: string, rejectedBy: string, reason: string): Promise<TelegramIngestion> {
    const sql = `
      UPDATE telegram_ingestions
      SET status = 'rejected',
          rejection_reason = $3,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [id, rejectedBy, reason]);

    if (result.rows.length === 0) {
      throw new Error(`Ingestion not found: ${id}`);
    }

    return this.mapRowToIngestion(result.rows[0]);
  }

  /**
   * Get ingestion by ID
   */
  async getById(id: string): Promise<TelegramIngestion | null> {
    const sql = 'SELECT * FROM telegram_ingestions WHERE id = $1';
    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToIngestion(result.rows[0]);
  }

  /**
   * Get ingestions by status
   */
  async getByStatus(status: IngestionStatus, limit = 100): Promise<TelegramIngestion[]> {
    const sql = `
      SELECT * FROM telegram_ingestions
      WHERE status = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await query(sql, [status, limit]);
    return result.rows.map(this.mapRowToIngestion);
  }

  /**
   * Get ingestions by source
   */
  async getBySource(source: string, limit = 100): Promise<TelegramIngestion[]> {
    const sql = `
      SELECT * FROM telegram_ingestions
      WHERE source = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await query(sql, [source, limit]);
    return result.rows.map(this.mapRowToIngestion);
  }

  /**
   * Get pending ingestions that need approval
   */
  async getPendingApproval(limit = 50): Promise<TelegramIngestion[]> {
    const sql = `
      SELECT * FROM telegram_ingestions
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT $1
    `;
    const result = await query(sql, [limit]);
    return result.rows.map(this.mapRowToIngestion);
  }

  /**
   * Get recent ingestions
   */
  async getRecent(limit = 50): Promise<TelegramIngestion[]> {
    const sql = `
      SELECT * FROM telegram_ingestions
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const result = await query(sql, [limit]);
    return result.rows.map(this.mapRowToIngestion);
  }

  /**
   * Create operational rule
   */
  async createOperationalRule(input: CreateOperationalRuleInput): Promise<OperationalRule> {
    const sql = `
      INSERT INTO operational_rules (
        name,
        description,
        rule_type,
        content,
        source,
        source_id,
        created_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await query(sql, [
      input.name,
      input.description || null,
      input.ruleType,
      JSON.stringify(input.content),
      input.source || 'telegram',
      input.sourceId || null,
      input.createdBy || null,
      'draft',
    ]);

    return this.mapRowToOperationalRule(result.rows[0]);
  }

  /**
   * Get operational rule by ID
   */
  async getOperationalRuleById(id: string): Promise<OperationalRule | null> {
    const sql = 'SELECT * FROM operational_rules WHERE id = $1';
    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToOperationalRule(result.rows[0]);
  }

  /**
   * Get operational rules by type
   */
  async getOperationalRulesByType(ruleType: string, activeOnly = true): Promise<OperationalRule[]> {
    const sql = activeOnly
      ? `SELECT * FROM operational_rules WHERE rule_type = $1 AND is_active = true ORDER BY version DESC`
      : `SELECT * FROM operational_rules WHERE rule_type = $1 ORDER BY version DESC`;
    
    const result = await query(sql, [ruleType]);
    return result.rows.map(this.mapRowToOperationalRule);
  }

  /**
   * Get all active operational rules
   */
  async getActiveOperationalRules(): Promise<OperationalRule[]> {
    const sql = `
      SELECT * FROM operational_rules
      WHERE is_active = true AND status = 'active'
      ORDER BY rule_type, name
    `;
    const result = await query(sql);
    return result.rows.map(this.mapRowToOperationalRule);
  }

  /**
   * Activate operational rule
   */
  async activateOperationalRule(id: string): Promise<OperationalRule> {
    const sql = `
      UPDATE operational_rules
      SET status = 'active', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sql, [id]);
    
    if (result.rows.length === 0) {
      throw new Error(`Operational rule not found: ${id}`);
    }

    return this.mapRowToOperationalRule(result.rows[0]);
  }

  /**
   * Deactivate operational rule
   */
  async deactivateOperationalRule(id: string): Promise<OperationalRule> {
    const sql = `
      UPDATE operational_rules
      SET status = 'deprecated', is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sql, [id]);
    
    if (result.rows.length === 0) {
      throw new Error(`Operational rule not found: ${id}`);
    }

    return this.mapRowToOperationalRule(result.rows[0]);
  }

  /**
   * Map database row to TelegramIngestion
   */
  private mapRowToIngestion(row: Record<string, unknown>): TelegramIngestion {
    return {
      id: row.id as string,
      telegramChatId: row.telegram_chat_id as number | undefined,
      telegramMessageId: row.telegram_message_id as number | undefined,
      source: row.source as import('./types').IngestionSource,
      rawContent: row.raw_content as string,
      title: row.title as string | undefined,
      classifiedType: row.classified_type as import('./types').TelegramContentType,
      classificationConfidence: Number(row.classification_confidence),
      destination: row.destination as import('./types').ContentDestination,
      targetTable: row.target_table as import('./types').TargetTable | undefined,
      status: row.status as IngestionStatus,
      validationErrors: (row.validation_errors as string[]) || [],
      contentLength: row.content_length as number,
      language: row.language as string,
      tags: (row.tags as string[]) || [],
      metadata: (row.metadata as Record<string, unknown>) || {},
      knowledgeDocumentId: row.knowledge_document_id as string | undefined,
      processedBy: row.processed_by as string | undefined,
      processedAt: row.processed_at as Date | undefined,
      approvedBy: row.approved_by as string | undefined,
      approvedAt: row.approved_at as Date | undefined,
      rejectionReason: row.rejection_reason as string | undefined,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  /**
   * Map database row to OperationalRule
   */
  private mapRowToOperationalRule(row: Record<string, unknown>): OperationalRule {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      ruleType: row.rule_type as string,
      content: row.content as Record<string, unknown>,
      version: row.version as number,
      source: row.source as string,
      sourceId: row.source_id as string | undefined,
      status: row.status as string,
      effectiveFrom: row.effective_from as Date | undefined,
      effectiveTo: row.effective_to as Date | undefined,
      createdBy: row.created_by as string | undefined,
      approvedBy: row.approved_by as string | undefined,
      approvedAt: row.approved_at as Date | undefined,
      isActive: row.is_active as boolean,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

export const telegramIngestionRepository = new TelegramIngestionRepository();
