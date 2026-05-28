import { KnowledgeDocument, KnowledgeChunk, CreateKnowledgeDocumentInput, UpdateKnowledgeDocumentInput, CreateKnowledgeChunkInput, KnowledgeCategory, KnowledgeDocumentStatus, KnowledgeSearchOptions } from './types';
/**
 * Knowledge Repository
 * Handles all database operations for knowledge documents and chunks
 */
declare class KnowledgeRepository {
    /**
     * Create a new knowledge document
     */
    createDocument(input: CreateKnowledgeDocumentInput): Promise<KnowledgeDocument>;
    /**
     * Update a knowledge document
     */
    updateDocument(input: UpdateKnowledgeDocumentInput): Promise<KnowledgeDocument>;
    /**
     * Get document by ID
     */
    getDocument(id: string): Promise<KnowledgeDocument | null>;
    /**
     * Get documents by category
     */
    getDocumentsByCategory(category: KnowledgeCategory): Promise<KnowledgeDocument[]>;
    /**
     * Get published documents
     */
    getPublishedDocuments(): Promise<KnowledgeDocument[]>;
    /**
     * List documents for administrative review.
     */
    listDocuments(filters?: {
        status?: KnowledgeDocumentStatus;
        category?: KnowledgeCategory;
        limit?: number;
    }): Promise<KnowledgeDocument[]>;
    /**
     * Submit a draft/rejected document for review.
     */
    submitForReview(id: string): Promise<KnowledgeDocument>;
    /**
     * Approve a document after review. Approval does not publish content.
     */
    approveDocument(id: string, approvedBy: string): Promise<KnowledgeDocument>;
    /**
     * Reject a document and keep it out of retrieval.
     */
    rejectDocument(id: string, rejectedBy: string, reason?: string): Promise<KnowledgeDocument>;
    /**
     * Approve and publish a document
     */
    publishDocument(id: string, approvedBy: string): Promise<KnowledgeDocument>;
    /**
     * Create a knowledge chunk
     */
    createChunk(input: CreateKnowledgeChunkInput): Promise<KnowledgeChunk>;
    /**
     * Create multiple chunks in a batch
     */
    createChunks(inputs: CreateKnowledgeChunkInput[]): Promise<KnowledgeChunk[]>;
    /**
     * Get chunks by document ID
     */
    getChunksByDocument(documentId: string): Promise<KnowledgeChunk[]>;
    /**
     * Search chunks using full-text search (PostgreSQL)
     * This is a fallback when vector store is not available
     */
    searchChunksFullText(options: KnowledgeSearchOptions): Promise<KnowledgeChunk[]>;
    /**
     * Get all active chunks (for vector embedding)
     */
    getAllActiveChunks(): Promise<KnowledgeChunk[]>;
    /**
     * Delete chunks by document ID (for version updates)
     */
    deleteChunksByDocument(documentId: string): Promise<void>;
    /**
     * Map database row to KnowledgeDocument
     */
    private mapRowToDocument;
    /**
     * Map database row to KnowledgeChunk
     */
    private mapRowToChunk;
}
export declare const knowledgeRepository: KnowledgeRepository;
export {};
//# sourceMappingURL=repository.d.ts.map