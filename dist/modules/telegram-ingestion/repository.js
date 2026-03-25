"use strict";
// Telegram Ingestion Repository
// Phase 5: Database operations for telegram_ingestions and operational_rules
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramIngestionRepository = void 0;
const db_1 = require("../../shared/db");
/**
 * Telegram Ingestion Repository
 * Handles database operations for telegram_ingestions and operational_rules
 */
class TelegramIngestionRepository {
    /**
     * Create a new telegram ingestion record
     */
    async create(input) {
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
        const result = await (0, db_1.query)(sql, [
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
    async updateWithClassification(id, classifiedType, confidence, title, tags, destination, targetTable, status) {
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
        const result = await (0, db_1.query)(sql, [
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
    async updateStatus(id, status, processedBy, knowledgeDocumentId, validationErrors) {
        const updates = ['status = $2', 'updated_at = NOW()'];
        const values = [id, status];
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
        const result = await (0, db_1.query)(sql, values);
        if (result.rows.length === 0) {
            throw new Error(`Ingestion not found: ${id}`);
        }
        return this.mapRowToIngestion(result.rows[0]);
    }
    /**
     * Approve an ingestion
     */
    async approve(id, approvedBy) {
        const sql = `
      UPDATE telegram_ingestions
      SET status = 'approved',
          approved_by = $2,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
        const result = await (0, db_1.query)(sql, [id, approvedBy]);
        if (result.rows.length === 0) {
            throw new Error(`Ingestion not found: ${id}`);
        }
        return this.mapRowToIngestion(result.rows[0]);
    }
    /**
     * Reject an ingestion
     */
    async reject(id, rejectedBy, reason) {
        const sql = `
      UPDATE telegram_ingestions
      SET status = 'rejected',
          rejection_reason = $3,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
        const result = await (0, db_1.query)(sql, [id, rejectedBy, reason]);
        if (result.rows.length === 0) {
            throw new Error(`Ingestion not found: ${id}`);
        }
        return this.mapRowToIngestion(result.rows[0]);
    }
    /**
     * Get ingestion by ID
     */
    async getById(id) {
        const sql = 'SELECT * FROM telegram_ingestions WHERE id = $1';
        const result = await (0, db_1.query)(sql, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToIngestion(result.rows[0]);
    }
    /**
     * Get ingestions by status
     */
    async getByStatus(status, limit = 100) {
        const sql = `
      SELECT * FROM telegram_ingestions
      WHERE status = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
        const result = await (0, db_1.query)(sql, [status, limit]);
        return result.rows.map(this.mapRowToIngestion);
    }
    /**
     * Get ingestions by source
     */
    async getBySource(source, limit = 100) {
        const sql = `
      SELECT * FROM telegram_ingestions
      WHERE source = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
        const result = await (0, db_1.query)(sql, [source, limit]);
        return result.rows.map(this.mapRowToIngestion);
    }
    /**
     * Get pending ingestions that need approval
     */
    async getPendingApproval(limit = 50) {
        const sql = `
      SELECT * FROM telegram_ingestions
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT $1
    `;
        const result = await (0, db_1.query)(sql, [limit]);
        return result.rows.map(this.mapRowToIngestion);
    }
    /**
     * Get recent ingestions
     */
    async getRecent(limit = 50) {
        const sql = `
      SELECT * FROM telegram_ingestions
      ORDER BY created_at DESC
      LIMIT $1
    `;
        const result = await (0, db_1.query)(sql, [limit]);
        return result.rows.map(this.mapRowToIngestion);
    }
    /**
     * Create operational rule
     */
    async createOperationalRule(input) {
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
        const result = await (0, db_1.query)(sql, [
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
    async getOperationalRuleById(id) {
        const sql = 'SELECT * FROM operational_rules WHERE id = $1';
        const result = await (0, db_1.query)(sql, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToOperationalRule(result.rows[0]);
    }
    /**
     * Get operational rules by type
     */
    async getOperationalRulesByType(ruleType, activeOnly = true) {
        const sql = activeOnly
            ? `SELECT * FROM operational_rules WHERE rule_type = $1 AND is_active = true ORDER BY version DESC`
            : `SELECT * FROM operational_rules WHERE rule_type = $1 ORDER BY version DESC`;
        const result = await (0, db_1.query)(sql, [ruleType]);
        return result.rows.map(this.mapRowToOperationalRule);
    }
    /**
     * Get all active operational rules
     */
    async getActiveOperationalRules() {
        const sql = `
      SELECT * FROM operational_rules
      WHERE is_active = true AND status = 'active'
      ORDER BY rule_type, name
    `;
        const result = await (0, db_1.query)(sql);
        return result.rows.map(this.mapRowToOperationalRule);
    }
    /**
     * Activate operational rule
     */
    async activateOperationalRule(id) {
        const sql = `
      UPDATE operational_rules
      SET status = 'active', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
        const result = await (0, db_1.query)(sql, [id]);
        if (result.rows.length === 0) {
            throw new Error(`Operational rule not found: ${id}`);
        }
        return this.mapRowToOperationalRule(result.rows[0]);
    }
    /**
     * Deactivate operational rule
     */
    async deactivateOperationalRule(id) {
        const sql = `
      UPDATE operational_rules
      SET status = 'deprecated', is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
        const result = await (0, db_1.query)(sql, [id]);
        if (result.rows.length === 0) {
            throw new Error(`Operational rule not found: ${id}`);
        }
        return this.mapRowToOperationalRule(result.rows[0]);
    }
    /**
     * Map database row to TelegramIngestion
     */
    mapRowToIngestion(row) {
        return {
            id: row.id,
            telegramChatId: row.telegram_chat_id,
            telegramMessageId: row.telegram_message_id,
            source: row.source,
            rawContent: row.raw_content,
            title: row.title,
            classifiedType: row.classified_type,
            classificationConfidence: Number(row.classification_confidence),
            destination: row.destination,
            targetTable: row.target_table,
            status: row.status,
            validationErrors: row.validation_errors || [],
            contentLength: row.content_length,
            language: row.language,
            tags: row.tags || [],
            metadata: row.metadata || {},
            knowledgeDocumentId: row.knowledge_document_id,
            processedBy: row.processed_by,
            processedAt: row.processed_at,
            approvedBy: row.approved_by,
            approvedAt: row.approved_at,
            rejectionReason: row.rejection_reason,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    /**
     * Map database row to OperationalRule
     */
    mapRowToOperationalRule(row) {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            ruleType: row.rule_type,
            content: row.content,
            version: row.version,
            source: row.source,
            sourceId: row.source_id,
            status: row.status,
            effectiveFrom: row.effective_from,
            effectiveTo: row.effective_to,
            createdBy: row.created_by,
            approvedBy: row.approved_by,
            approvedAt: row.approved_at,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
exports.telegramIngestionRepository = new TelegramIngestionRepository();
//# sourceMappingURL=repository.js.map