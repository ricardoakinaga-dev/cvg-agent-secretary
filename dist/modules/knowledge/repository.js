"use strict";
// Knowledge Repository - Database operations for Knowledge documents and chunks
// Phase 3: RAG and Institutional Knowledge
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeRepository = void 0;
const db_1 = require("../../shared/db");
/**
 * Knowledge Repository
 * Handles all database operations for knowledge documents and chunks
 */
class KnowledgeRepository {
    /**
     * Create a new knowledge document
     */
    async createDocument(input) {
        const sql = `
      INSERT INTO knowledge_documents (
        title, content, category, status, version, source, source_id,
        tags, metadata, created_by, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
        const result = await (0, db_1.query)(sql, [
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
    async updateDocument(input) {
        const updates = [];
        const values = [];
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
        const result = await (0, db_1.query)(sql, values);
        if (result.rows.length === 0) {
            throw new Error(`Document not found: ${input.id}`);
        }
        return this.mapRowToDocument(result.rows[0]);
    }
    /**
     * Get document by ID
     */
    async getDocument(id) {
        const sql = 'SELECT * FROM knowledge_documents WHERE id = $1';
        const result = await (0, db_1.query)(sql, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToDocument(result.rows[0]);
    }
    /**
     * Get documents by category
     */
    async getDocumentsByCategory(category) {
        const sql = `
      SELECT * FROM knowledge_documents 
      WHERE category = $1 AND is_active = true
      ORDER BY version DESC, created_at DESC
    `;
        const result = await (0, db_1.query)(sql, [category]);
        return result.rows.map(this.mapRowToDocument);
    }
    /**
     * Get published documents
     */
    async getPublishedDocuments() {
        const sql = `
      SELECT * FROM knowledge_documents 
      WHERE status = 'published' AND is_active = true
      ORDER BY category, title
    `;
        const result = await (0, db_1.query)(sql);
        return result.rows.map(this.mapRowToDocument);
    }
    /**
     * Approve and publish a document
     */
    async publishDocument(id, approvedBy) {
        // First deactivate old versions
        await (0, db_1.query)(`UPDATE knowledge_documents SET is_active = false, status = 'approved' 
       WHERE id != $1 AND title = (SELECT title FROM knowledge_documents WHERE id = $1)`, [id]);
        // Then publish the new version
        const sql = `
      UPDATE knowledge_documents
      SET status = 'published', approved_by = $2, approved_at = NOW(), 
          version = version + 1, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
        const result = await (0, db_1.query)(sql, [id, approvedBy]);
        if (result.rows.length === 0) {
            throw new Error(`Document not found: ${id}`);
        }
        return this.mapRowToDocument(result.rows[0]);
    }
    /**
     * Create a knowledge chunk
     */
    async createChunk(input) {
        const sql = `
      INSERT INTO knowledge_chunks (
        document_id, chunk_index, content, embedding, token_count,
        title, category, tags, version, source, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
        // Handle embedding array for PostgreSQL
        let embeddingValue = null;
        if (input.embedding && input.embedding.length > 0) {
            embeddingValue = input.embedding;
        }
        const result = await (0, db_1.query)(sql, [
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
    async createChunks(inputs) {
        const chunks = [];
        for (const input of inputs) {
            const chunk = await this.createChunk(input);
            chunks.push(chunk);
        }
        return chunks;
    }
    /**
     * Get chunks by document ID
     */
    async getChunksByDocument(documentId) {
        const sql = `
      SELECT * FROM knowledge_chunks 
      WHERE document_id = $1 AND is_active = true
      ORDER BY chunk_index
    `;
        const result = await (0, db_1.query)(sql, [documentId]);
        return result.rows.map(this.mapRowToChunk);
    }
    /**
     * Search chunks using full-text search (PostgreSQL)
     * This is a fallback when vector store is not available
     */
    async searchChunksFullText(options) {
        const limit = options.limit || 5;
        const categoryFilter = options.category ? `AND category = $2` : '';
        const params = [options.query];
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
        const result = await (0, db_1.query)(sql, params);
        return result.rows.map(this.mapRowToChunk);
    }
    /**
     * Get all active chunks (for vector embedding)
     */
    async getAllActiveChunks() {
        const sql = `
      SELECT * FROM knowledge_chunks 
      WHERE is_active = true
      ORDER BY document_id, chunk_index
    `;
        const result = await (0, db_1.query)(sql);
        return result.rows.map(this.mapRowToChunk);
    }
    /**
     * Delete chunks by document ID (for version updates)
     */
    async deleteChunksByDocument(documentId) {
        const sql = `
      UPDATE knowledge_chunks 
      SET is_active = false 
      WHERE document_id = $1
    `;
        await (0, db_1.query)(sql, [documentId]);
    }
    /**
     * Map database row to KnowledgeDocument
     */
    mapRowToDocument(row) {
        return {
            id: row.id,
            title: row.title,
            content: row.content,
            category: row.category,
            status: row.status,
            version: row.version,
            source: row.source,
            sourceId: row.source_id,
            effectiveFrom: row.effective_from,
            effectiveTo: row.effective_to,
            createdBy: row.created_by,
            approvedBy: row.approved_by,
            approvedAt: row.approved_at,
            tags: row.tags || [],
            metadata: row.metadata || {},
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    /**
     * Map database row to KnowledgeChunk
     */
    mapRowToChunk(row) {
        return {
            id: row.id,
            documentId: row.document_id,
            chunkIndex: row.chunk_index,
            content: row.content,
            embedding: row.embedding,
            tokenCount: row.token_count,
            title: row.title,
            category: row.category,
            tags: row.tags || [],
            version: row.version,
            source: row.source,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
exports.knowledgeRepository = new KnowledgeRepository();
//# sourceMappingURL=repository.js.map