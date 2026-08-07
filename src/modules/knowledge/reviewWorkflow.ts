import { getClient, query } from '../../shared/db';
import { config } from '../../config';
import {
  assertAuditPrincipal,
  type AuditPrincipal,
  auditService,
} from '../audit/service';
import { logger } from '../logging';
import type { KnowledgeChunk, KnowledgeDocument } from './types';
import {
  INSERT_KNOWLEDGE_CHUNK_SQL,
  knowledgeChunkParams,
  mapRowToKnowledgeChunk,
  mapRowToKnowledgeDocument,
} from './persistence';

export class KnowledgeReviewWorkflow {
  private async getDocument(id: string): Promise<KnowledgeDocument | null> {
    const result = await query(
      'SELECT * FROM knowledge_documents WHERE tenant_id = $1 AND id = $2',
      [config.chatwoot.accountId, id]
    );
    return result.rows.length > 0 ? mapRowToKnowledgeDocument(result.rows[0]) : null;
  }

  /**
   * Approve a document after review. Approval does not publish content.
   */
  async approveDocument(id: string, principal: AuditPrincipal): Promise<KnowledgeDocument> {
    assertAuditPrincipal(principal);
    const approvedBy = principal.id;
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        'SELECT * FROM knowledge_documents WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
        [config.chatwoot.accountId, id]
      );
      if (locked.rows.length === 0) throw new Error(`Document not found: ${id}`);
      const current = mapRowToKnowledgeDocument(locked.rows[0]);
      if (current.status !== 'pending_review') {
        throw new Error(`Document must be pending_review before approval: ${current.status}`);
      }

      const updated = await client.query(
        `UPDATE knowledge_documents
         SET status = 'approved', approved_by = $3, approved_at = NOW(), updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 AND status = 'pending_review'
         RETURNING *`,
        [config.chatwoot.accountId, id, approvedBy]
      );
      if (updated.rows.length === 0) throw new Error(`Document changed during approval: ${id}`);
      const approved = mapRowToKnowledgeDocument(updated.rows[0]);
      await auditService.recordEvent({
        eventType: 'knowledge_updated',
        actor: approvedBy,
        actorRole: principal.role,
        actorSource: principal.source,
        resourceType: 'knowledge_document',
        resourceId: id,
        action: 'approve',
        correlationId: principal.correlationId,
        idempotencyKey: `knowledge:${id}:approve:${approved.updatedAt.toISOString()}`,
        details: { category: approved.category, status: approved.status, version: approved.version },
      }, client);
      await client.query('COMMIT');
      return approved;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reject a document and keep it out of retrieval.
   */
  async rejectDocument(id: string, principal: AuditPrincipal, reason?: string): Promise<KnowledgeDocument> {
    assertAuditPrincipal(principal);
    const rejectedBy = principal.id;
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        'SELECT * FROM knowledge_documents WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
        [config.chatwoot.accountId, id]
      );
      if (locked.rows.length === 0) throw new Error(`Document not found: ${id}`);
      const current = mapRowToKnowledgeDocument(locked.rows[0]);
      if (!['pending_review', 'draft'].includes(current.status)) {
        throw new Error(`Document cannot be rejected from status: ${current.status}`);
      }

      const metadata = {
        ...current.metadata,
        rejectionReason: reason,
        rejectedBy,
        rejectedAt: new Date().toISOString(),
      };
      const updated = await client.query(
        `UPDATE knowledge_documents
         SET status = 'rejected', metadata = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 AND status IN ('pending_review', 'draft')
         RETURNING *`,
        [config.chatwoot.accountId, id, JSON.stringify(metadata)]
      );
      if (updated.rows.length === 0) throw new Error(`Document changed during rejection: ${id}`);
      const rejected = mapRowToKnowledgeDocument(updated.rows[0]);
      await auditService.recordEvent({
        eventType: 'knowledge_rejected',
        actor: rejectedBy,
        actorRole: principal.role,
        actorSource: principal.source,
        resourceType: 'knowledge_document',
        resourceId: id,
        action: 'reject',
        correlationId: principal.correlationId,
        idempotencyKey: `knowledge:${id}:reject:${rejected.updatedAt.toISOString()}`,
        details: { category: rejected.category, status: rejected.status, version: rejected.version },
      }, client);
      await client.query('COMMIT');
      return rejected;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Approve and publish a document
   */
  async publishDocument(id: string, principal: AuditPrincipal): Promise<KnowledgeDocument> {
    assertAuditPrincipal(principal);
    const approvedBy = principal.id;
    const doc = await this.getDocument(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }

    if (doc.status !== 'approved') {
      throw new Error(`Document must be approved before publication: ${doc.status}`);
    }

    const publicationCandidate: KnowledgeDocument = {
      ...doc,
      status: 'published',
      version: doc.version + 1,
      approvedBy,
      approvedAt: new Date(),
    };
    const { prepareChunksForDocument, indexChunksInVectorStore } = await import('./pipeline');
    const chunkInputs = await prepareChunksForDocument(publicationCandidate);
    if (chunkInputs.length === 0) {
      throw new Error(`No chunks generated for document: ${id}`);
    }

    const client = await getClient();
    let publishedDoc: KnowledgeDocument;
    const createdChunks: KnowledgeChunk[] = [];

    try {
      await client.query('BEGIN');

      const lockedResult = await client.query(
        'SELECT * FROM knowledge_documents WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
        [config.chatwoot.accountId, id]
      );
      if (lockedResult.rows.length === 0) {
        throw new Error(`Document not found: ${id}`);
      }

      const lockedDocument = mapRowToKnowledgeDocument(lockedResult.rows[0]);
      if (lockedDocument.status !== 'approved') {
        throw new Error(`Document must be approved before publication: ${lockedDocument.status}`);
      }
      if (lockedDocument.updatedAt.getTime() !== doc.updatedAt.getTime()) {
        throw new Error(`Document changed during publication: ${id}`);
      }

      // Replace any abandoned chunks for this draft inside the same transaction.
      await client.query(
        'UPDATE knowledge_chunks SET is_active = false WHERE tenant_id = $1 AND document_id = $2',
        [config.chatwoot.accountId, id]
      );

      for (const input of chunkInputs) {
        const chunkResult = await client.query(INSERT_KNOWLEDGE_CHUNK_SQL, knowledgeChunkParams(input));
        createdChunks.push(mapRowToKnowledgeChunk(chunkResult.rows[0]));
      }

      // Deactivate chunks and documents from previous versions atomically.
      await client.query(
        `UPDATE knowledge_chunks
         SET is_active = false
         WHERE tenant_id = $1
           AND document_id IN (
           SELECT id FROM knowledge_documents
           WHERE tenant_id = $1 AND id != $2 AND title = $3
         )`,
        [config.chatwoot.accountId, id, lockedDocument.title]
      );
      await client.query(
        `UPDATE knowledge_documents
         SET is_active = false, status = 'approved', updated_at = NOW()
         WHERE tenant_id = $1 AND id != $2 AND title = $3`,
        [config.chatwoot.accountId, id, lockedDocument.title]
      );

      const result = await client.query(
        `UPDATE knowledge_documents
         SET status = 'published', is_active = true, approved_by = $3,
             approved_at = NOW(), version = version + 1, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 AND status = 'approved'
         RETURNING *`,
        [config.chatwoot.accountId, id, approvedBy]
      );
      if (result.rows.length === 0) {
        throw new Error(`Document not found: ${id}`);
      }

      publishedDoc = mapRowToKnowledgeDocument(result.rows[0]);
      await auditService.recordEvent({
        eventType: 'knowledge_published',
        actor: approvedBy,
        actorRole: principal.role,
        actorSource: principal.source,
        resourceType: 'knowledge_document',
        resourceId: id,
        action: 'publish',
        correlationId: principal.correlationId,
        idempotencyKey: `knowledge:${id}:publish:${publishedDoc.version}`,
        details: {
          category: publishedDoc.category,
          status: publishedDoc.status,
          version: publishedDoc.version,
        },
      }, client);
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.warn('Failed to roll back knowledge publication transaction', {
          documentId: id,
          error: (rollbackError as Error).message,
        });
      }
      throw error;
    } finally {
      client.release();
    }

    // External indexing is deliberately post-commit and cannot corrupt DB state.
    try {
      await indexChunksInVectorStore(createdChunks);
    } catch (error) {
      logger.warn('Failed to index published chunks in vector store', {
        documentId: id,
        error: (error as Error).message,
      });
    }

    return publishedDoc;
  }
}

export const knowledgeReviewWorkflow = new KnowledgeReviewWorkflow();
