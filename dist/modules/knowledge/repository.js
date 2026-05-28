"use strict";
// Knowledge Repository - Database operations for Knowledge documents and chunks
// Phase 3: RAG and Institutional Knowledge
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeRepository = void 0;
const db_1 = require("../../shared/db");
const service_1 = require("../audit/service");
const logging_1 = require("../logging");
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
     * List documents for administrative review.
     */
    async listDocuments(filters = {}) {
        const clauses = ['is_active = true'];
        const params = [];
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
        const result = await (0, db_1.query)(sql, params);
        return result.rows.map(this.mapRowToDocument);
    }
    /**
     * Submit a draft/rejected document for review.
     */
    async submitForReview(id) {
        const doc = await this.getDocument(id);
        if (!doc) {
            throw new Error(`Document not found: ${id}`);
        }
        if (!['draft', 'rejected'].includes(doc.status)) {
            throw new Error(`Document cannot be submitted for review from status: ${doc.status}`);
        }
        return this.updateDocument({ id, status: 'pending_review' });
    }
    /**
     * Approve a document after review. Approval does not publish content.
     */
    async approveDocument(id, approvedBy) {
        const doc = await this.getDocument(id);
        if (!doc) {
            throw new Error(`Document not found: ${id}`);
        }
        if (doc.status !== 'pending_review') {
            throw new Error(`Document must be pending_review before approval: ${doc.status}`);
        }
        const approved = await this.updateDocument({
            id,
            status: 'approved',
            approvedBy,
        });
        await service_1.auditService.recordEvent({
            eventType: 'knowledge_updated',
            actor: approvedBy,
            resourceType: 'knowledge_document',
            resourceId: id,
            action: 'approve',
            details: {
                title: approved.title,
                category: approved.category,
            },
        });
        return approved;
    }
    /**
     * Reject a document and keep it out of retrieval.
     */
    async rejectDocument(id, rejectedBy, reason) {
        const doc = await this.getDocument(id);
        if (!doc) {
            throw new Error(`Document not found: ${id}`);
        }
        if (!['pending_review', 'draft'].includes(doc.status)) {
            throw new Error(`Document cannot be rejected from status: ${doc.status}`);
        }
        const metadata = {
            ...doc.metadata,
            rejectionReason: reason,
            rejectedBy,
            rejectedAt: new Date().toISOString(),
        };
        const rejected = await this.updateDocument({
            id,
            status: 'rejected',
            metadata,
        });
        await service_1.auditService.recordEvent({
            eventType: 'knowledge_rejected',
            actor: rejectedBy,
            resourceType: 'knowledge_document',
            resourceId: id,
            action: 'reject',
            details: {
                title: rejected.title,
                category: rejected.category,
                reason,
            },
        });
        return rejected;
    }
    /**
     * Approve and publish a document
     */
    async publishDocument(id, approvedBy) {
        const doc = await this.getDocument(id);
        if (!doc) {
            throw new Error(`Document not found: ${id}`);
        }
        if (doc.status !== 'approved') {
            throw new Error(`Document must be approved before publication: ${doc.status}`);
        }
        await (0, db_1.query)(`UPDATE knowledge_documents SET is_active = false, status = 'approved' 
       WHERE id != $1 AND title = (SELECT title FROM knowledge_documents WHERE id = $1)`, [id]);
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
        const publishedDoc = this.mapRowToDocument(result.rows[0]);
        // Create chunks for the published document
        try {
            const { createChunksForDocument } = await Promise.resolve().then(() => __importStar(require('./pipeline')));
            await createChunksForDocument(publishedDoc);
        }
        catch (error) {
            logging_1.logger.warn('Failed to create chunks for document', {
                documentId: id,
                error: error.message,
            });
        }
        // Audit trail for publication
        await service_1.auditService.recordEvent({
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