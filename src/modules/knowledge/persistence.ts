import { config } from '../../config';
import type {
  CreateKnowledgeChunkInput,
  KnowledgeCategory,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeDocumentStatus,
  KnowledgeSource,
} from './types';

export const INSERT_KNOWLEDGE_CHUNK_SQL = `
  INSERT INTO knowledge_chunks (
    tenant_id, document_id, chunk_index, content, embedding, token_count,
    title, category, tags, version, source, is_active
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  RETURNING *
`;

export function knowledgeChunkParams(input: CreateKnowledgeChunkInput): unknown[] {
  return [
    config.chatwoot.accountId,
    input.documentId,
    input.chunkIndex,
    input.content,
    input.embedding && input.embedding.length > 0 ? input.embedding : null,
    input.tokenCount || null,
    input.title || null,
    input.category,
    JSON.stringify(input.tags || []),
    input.version || 1,
    input.source || 'manual',
    true,
  ];
}

export function mapRowToKnowledgeDocument(row: Record<string, unknown>): KnowledgeDocument {
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

export function mapRowToKnowledgeChunk(row: Record<string, unknown>): KnowledgeChunk {
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
