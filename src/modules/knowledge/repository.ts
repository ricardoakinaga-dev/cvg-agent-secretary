// Knowledge Repository - Database operations for Knowledge documents and chunks
// Phase 3: RAG and Institutional Knowledge

import { query } from '../../shared/db';
import { auditService } from '../audit/service';
import { 
  KnowledgeDocument, 
  KnowledgeChunk, 
  CreateKnowledgeDocumentInput, 
  UpdateKnowledgeDocumentInput,
  CreateKnowledgeChunkInput,
  KnowledgeCategory,
  KnowledgeDocumentStatus,
  KnowledgeSearchOptions,
  KnowledgeSource,
} from './types';

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
        title, content, category, status, version, source, source_id,
        tags, metadata, created_by, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await query(sql, [
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

    return this.mapRowToDocument(result.rows[0]);
  }

  /**
   * Update a knowledge document
   */
  async updateDocument(input: UpdateKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

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
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, values);
    
    if (result.rows.length === 0) {
      throw new Error(`Document not found: ${input.id}`);
    }

    return this.mapRowToDocument(result.rows[0]);
  }

  /**
   * Get document by ID
   */
  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    const sql = 'SELECT * FROM knowledge_documents WHERE id = $1';
    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToDocument(result.rows[0]);
  }

  /**
   * Get documents by category
   */
  async getDocumentsByCategory(category: KnowledgeCategory): Promise<KnowledgeDocument[]> {
    const sql = `
      SELECT * FROM knowledge_documents 
      WHERE category = $1 AND is_active = true
      ORDER BY version DESC, created_at DESC
    `;
    const result = await query(sql, [category]);
    return result.rows.map(this.mapRowToDocument);
  }

  /**
   * Get published documents
   */
  async getPublishedDocuments(): Promise<KnowledgeDocument[]> {
    const sql = `
      SELECT * FROM knowledge_documents 
      WHERE status = 'published' AND is_active = true
      ORDER BY category, title
    `;
    const result = await query(sql);
    return result.rows.map(this.mapRowToDocument);
  }

  /**
   * Approve and publish a document
   */
  async publishDocument(id: string, approvedBy: string): Promise<KnowledgeDocument> {
    const doc = await this.getDocument(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }

    await query(
      `UPDATE knowledge_documents SET is_active = false, status = 'approved' 
       WHERE id != $1 AND title = (SELECT title FROM knowledge_documents WHERE id = $1)`,
      [id]
    );

    const sql = `
      UPDATE knowledge_documents
      SET status = 'published', approved_by = $2, approved_at = NOW(), 
          version = version + 1, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sql, [id, approvedBy]);
    
    if (result.rows.length === 0) {
      throw new Error(`Document not found: ${id}`);
    }

    const publishedDoc = this.mapRowToDocument(result.rows[0]);

    // Create chunks for the published document
    try {
      const { createChunksForDocument } = await import('./pipeline');
      await createChunksForDocument(publishedDoc);
    } catch (error) {
      console.warn('Failed to create chunks for document:', (error as Error).message);
    }

    // Audit trail for publication
    await auditService.recordEvent({
      eventType: 'knowledge_published',
      actor: approvedBy,
      resourceType: 'knowledge_document',
      resourceId: id,
      action: 'publish',
      details: {
        title: publishedDoc.title,
        category: publishedDoc.category,
        version: publishedDoc.version,
      },
    });

    return publishedDoc;
  }

  /**
   * Create a knowledge chunk
   */
  async createChunk(input: CreateKnowledgeChunkInput): Promise<KnowledgeChunk> {
    const sql = `
      INSERT INTO knowledge_chunks (
        document_id, chunk_index, content, embedding, token_count,
        title, category, tags, version, source, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    // Handle embedding array for PostgreSQL
    let embeddingValue: unknown = null;
    if (input.embedding && input.embedding.length > 0) {
      embeddingValue = input.embedding;
    }

    const result = await query(sql, [
      input.documentId,
      input.chunkIndex,
      input.content,
      embeddingValue,
      input.tokenCount || null,
      input.title || null,
      input.category,
      JSON.stringify(input.tags || []),
      input.version || 1,
      input.source || 'manual',
      true,
    ]);

    return this.mapRowToChunk(result.rows[0]);
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
      SELECT * FROM knowledge_chunks 
      WHERE document_id = $1 AND is_active = true
      ORDER BY chunk_index
    `;
    const result = await query(sql, [documentId]);
    return result.rows.map(this.mapRowToChunk);
  }

  /**
   * Search chunks using full-text search (PostgreSQL)
   * This is a fallback when vector store is not available
   */
  async searchChunksFullText(options: KnowledgeSearchOptions): Promise<KnowledgeChunk[]> {
    const limit = options.limit || 5;
    const categoryFilter = options.category ? `AND category = $2` : '';
    const params: unknown[] = [options.query];

    if (options.category) {
      params.push(options.category);
    }

    const sql = `
      SELECT *, 
        ts_rank(to_tsvector('portuguese', content), plainto_tsquery('portuguese', $1)) as rank
      FROM knowledge_chunks
      WHERE is_active = true 
        ${categoryFilter}
        AND to_tsvector('portuguese', content) @@ plainto_tsquery('portuguese', $1)
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    const result = await query(sql, params);
    return result.rows.map(this.mapRowToChunk);
  }

  /**
   * Get all active chunks (for vector embedding)
   */
  async getAllActiveChunks(): Promise<KnowledgeChunk[]> {
    const sql = `
      SELECT * FROM knowledge_chunks 
      WHERE is_active = true
      ORDER BY document_id, chunk_index
    `;
    const result = await query(sql);
    return result.rows.map(this.mapRowToChunk);
  }

  /**
   * Delete chunks by document ID (for version updates)
   */
  async deleteChunksByDocument(documentId: string): Promise<void> {
    const sql = `
      UPDATE knowledge_chunks 
      SET is_active = false 
      WHERE document_id = $1
    `;
    await query(sql, [documentId]);
  }

  /**
   * Map database row to KnowledgeDocument
   */
  private mapRowToDocument(row: Record<string, unknown>): KnowledgeDocument {
    return {
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      category: row.category as KnowledgeCategory,
      status: row.status as KnowledgeDocumentStatus,
      version: row.version as number,
      source: row.source as KnowledgeSource,
      sourceId: row.source_id as string | undefined,
      effectiveFrom: row.effective_from as Date | undefined,
      effectiveTo: row.effective_to as Date | undefined,
      createdBy: row.created_by as string | undefined,
      approvedBy: row.approved_by as string | undefined,
      approvedAt: row.approved_at as Date | undefined,
      tags: (row.tags as string[]) || [],
      metadata: (row.metadata as Record<string, unknown>) || {},
      isActive: row.is_active as boolean,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  /**
   * Map database row to KnowledgeChunk
   */
  private mapRowToChunk(row: Record<string, unknown>): KnowledgeChunk {
    return {
      id: row.id as string,
      documentId: row.document_id as string,
      chunkIndex: row.chunk_index as number,
      content: row.content as string,
      embedding: row.embedding as number[] | undefined,
      tokenCount: row.token_count as number | undefined,
      title: row.title as string | undefined,
      category: row.category as KnowledgeCategory,
      tags: (row.tags as string[]) || [],
      version: row.version as number,
      source: row.source as KnowledgeSource,
      isActive: row.is_active as boolean,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

export const knowledgeRepository = new KnowledgeRepository();
