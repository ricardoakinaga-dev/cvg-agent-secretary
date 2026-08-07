// Knowledge Repository - Database operations for Knowledge documents and chunks
// Phase 3: RAG and Institutional Knowledge

import { query } from '../../shared/db';
import { config } from '../../config';
import { clampInteger } from '../../shared/numbers';
import type { AuditPrincipal } from '../audit/service';
import {
  KnowledgeDocument,
  KnowledgeChunk,
  CreateKnowledgeDocumentInput,
  UpdateKnowledgeDocumentInput,
  CreateKnowledgeChunkInput,
  KnowledgeCategory,
  KnowledgeDocumentStatus,
  KnowledgeSearchOptions,
} from './types';
import {
  INSERT_KNOWLEDGE_CHUNK_SQL,
  knowledgeChunkParams,
  mapRowToKnowledgeChunk,
  mapRowToKnowledgeDocument,
} from './persistence';
import { knowledgeReviewWorkflow } from './reviewWorkflow';

/**
 * Knowledge Repository
 * Handles all database operations for knowledge documents and chunks
 */
class KnowledgeRepository {
  /**
   * Create a new knowledge document
   */
  async createDocument(input: CreateKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    const sql = `
      INSERT INTO knowledge_documents (
        tenant_id, title, content, category, status, version, source, source_id,
        tags, metadata, created_by, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await query(sql, [
      config.chatwoot.accountId,
      input.title,
      input.content,
      input.category,
      'draft', // Initial status
      1, // Initial version
      input.source || 'manual',
      input.sourceId || null,
      JSON.stringify(input.tags || []),
      JSON.stringify(input.metadata || {}),
      input.createdBy || null,
      true,
    ]);

    return mapRowToKnowledgeDocument(result.rows[0]);
  }

  /**
   * Update a knowledge document
   */
  async updateDocument(input: UpdateKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    const updates: string[] = [];
    const values: unknown[] = [config.chatwoot.accountId];
    let paramIndex = 2;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }
    if (input.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(input.content);
    }
    if (input.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(input.category);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(JSON.stringify(input.tags));
    }
    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(input.metadata));
    }
    if (input.approvedBy !== undefined) {
      updates.push(`approved_by = $${paramIndex++}`);
      values.push(input.approvedBy);
      updates.push(`approved_at = NOW()`);
    }

    if (updates.length === 0) {
      throw new Error('No updates provided');
    }

    values.push(input.id);

    const sql = `
      UPDATE knowledge_documents
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, values);
    
    if (result.rows.length === 0) {
      throw new Error(`Document not found: ${input.id}`);
    }

    return mapRowToKnowledgeDocument(result.rows[0]);
  }

  /**
   * Get document by ID
   */
  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    const sql = 'SELECT * FROM knowledge_documents WHERE tenant_id = $1 AND id = $2';
    const result = await query(sql, [config.chatwoot.accountId, id]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToKnowledgeDocument(result.rows[0]);
  }

  /**
   * Get documents by category
   */
  async getDocumentsByCategory(category: KnowledgeCategory): Promise<KnowledgeDocument[]> {
    const sql = `
      SELECT * FROM knowledge_documents 
      WHERE tenant_id = $1 AND category = $2 AND is_active = true
      ORDER BY version DESC, created_at DESC
    `;
    const result = await query(sql, [config.chatwoot.accountId, category]);
    return result.rows.map(mapRowToKnowledgeDocument);
  }

  /**
   * Get published documents
   */
  async getPublishedDocuments(): Promise<KnowledgeDocument[]> {
    const sql = `
      SELECT * FROM knowledge_documents 
      WHERE tenant_id = $1 AND status = 'published' AND is_active = true
      ORDER BY category, title
    `;
    const result = await query(sql, [config.chatwoot.accountId]);
    return result.rows.map(mapRowToKnowledgeDocument);
  }

  /**
   * List documents for administrative review.
   */
  async listDocuments(filters: {
    status?: KnowledgeDocumentStatus;
    category?: KnowledgeCategory;
    limit?: number;
  } = {}): Promise<KnowledgeDocument[]> {
    const clauses = ['tenant_id = $1', 'is_active = true'];
    const params: unknown[] = [config.chatwoot.accountId];

    if (filters.status) {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }

    if (filters.category) {
      params.push(filters.category);
      clauses.push(`category = $${params.length}`);
    }

    params.push(filters.limit || 50);

    const sql = `
      SELECT * FROM knowledge_documents
      WHERE ${clauses.join(' AND ')}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT $${params.length}
    `;

    const result = await query(sql, params);
    return result.rows.map(mapRowToKnowledgeDocument);
  }

  /**
   * Submit a draft/rejected document for review.
   */
  async submitForReview(id: string): Promise<KnowledgeDocument> {
    const doc = await this.getDocument(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }

    if (!['draft', 'rejected'].includes(doc.status)) {
      throw new Error(`Document cannot be submitted for review from status: ${doc.status}`);
    }

    return this.updateDocument({ id, status: 'pending_review' });
  }


  /** Critical review transitions are isolated in a transaction-focused workflow. */
  async approveDocument(id: string, principal: AuditPrincipal): Promise<KnowledgeDocument> {
    return knowledgeReviewWorkflow.approveDocument(id, principal);
  }

  async rejectDocument(
    id: string,
    principal: AuditPrincipal,
    reason?: string
  ): Promise<KnowledgeDocument> {
    return knowledgeReviewWorkflow.rejectDocument(id, principal, reason);
  }

  async publishDocument(id: string, principal: AuditPrincipal): Promise<KnowledgeDocument> {
    return knowledgeReviewWorkflow.publishDocument(id, principal);
  }

  /**
   * Create a knowledge chunk
   */
  async createChunk(input: CreateKnowledgeChunkInput): Promise<KnowledgeChunk> {
    const result = await query(INSERT_KNOWLEDGE_CHUNK_SQL, knowledgeChunkParams(input));

    return mapRowToKnowledgeChunk(result.rows[0]);
  }


  /**
   * Create multiple chunks in a batch
   */
  async createChunks(inputs: CreateKnowledgeChunkInput[]): Promise<KnowledgeChunk[]> {
    const chunks: KnowledgeChunk[] = [];
    
    for (const input of inputs) {
      const chunk = await this.createChunk(input);
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Get chunks by document ID
   */
  async getChunksByDocument(documentId: string): Promise<KnowledgeChunk[]> {
    const sql = `
      SELECT kc.* FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.tenant_id = kc.tenant_id AND kd.id = kc.document_id
      WHERE kc.tenant_id = $1
        AND kc.document_id = $2
        AND kc.is_active = true
        AND kd.is_active = true
        AND kd.status = 'published'
      ORDER BY kc.chunk_index
    `;
    const result = await query(sql, [config.chatwoot.accountId, documentId]);
    return result.rows.map(mapRowToKnowledgeChunk);
  }

  /**
   * Search chunks using full-text search (PostgreSQL)
   * This is a fallback when vector store is not available
   */
  async searchChunksFullText(options: KnowledgeSearchOptions): Promise<KnowledgeChunk[]> {
    const limit = clampInteger(options.limit, 5, 1, 100);
    const categoryFilter = options.category ? `AND kc.category = $3` : '';
    const params: unknown[] = [config.chatwoot.accountId, options.query];

    if (options.category) {
      params.push(options.category);
    }
    const limitParameter = `$${params.length + 1}`;
    params.push(limit);

    const sql = `
      SELECT kc.*,
        ts_rank(to_tsvector('portuguese', kc.content), plainto_tsquery('portuguese', $2)) as rank
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.tenant_id = kc.tenant_id AND kd.id = kc.document_id
      WHERE kc.tenant_id = $1
        AND kc.is_active = true
        AND kd.is_active = true
        AND kd.status = 'published'
        ${categoryFilter}
        AND to_tsvector('portuguese', kc.content) @@ plainto_tsquery('portuguese', $2)
      ORDER BY rank DESC
      LIMIT ${limitParameter}
    `;

    const result = await query(sql, params);
    return result.rows.map(mapRowToKnowledgeChunk);
  }

  /**
   * Get all active chunks (for vector embedding)
   */
  async getAllActiveChunks(): Promise<KnowledgeChunk[]> {
    const sql = `
      SELECT kc.* FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.tenant_id = kc.tenant_id AND kd.id = kc.document_id
      WHERE kc.tenant_id = $1
        AND kc.is_active = true
        AND kd.is_active = true
        AND kd.status = 'published'
      ORDER BY kc.document_id, kc.chunk_index
    `;
    const result = await query(sql, [config.chatwoot.accountId]);
    return result.rows.map(mapRowToKnowledgeChunk);
  }

  /**
   * Delete chunks by document ID (for version updates)
   */
  async deleteChunksByDocument(documentId: string): Promise<void> {
    const sql = `
      UPDATE knowledge_chunks 
      SET is_active = false 
      WHERE tenant_id = $1 AND document_id = $2
    `;
    await query(sql, [config.chatwoot.accountId, documentId]);
  }

}

export const knowledgeRepository = new KnowledgeRepository();
