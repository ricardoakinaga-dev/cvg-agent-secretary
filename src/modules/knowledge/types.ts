// Knowledge Types for RAG System
// Phase 3: RAG and Institutional Knowledge

/**
 * Knowledge document categories
 */
export type KnowledgeCategory = 
  | 'faq'           // Frequently asked questions
  | 'policy'        // Hospital policies
  | 'procedure'     // Procedures and processes
  | 'service'       // Services offered
  | 'orientation';  // Post-treatment orientations

/**
 * Document status in approval workflow
 */
export type KnowledgeDocumentStatus = 
  | 'draft'           // Being edited
  | 'pending_review'  // Awaiting approval
  | 'approved'        // Approved, not yet published
  | 'published'       // Active and available
  | 'rejected';       // Not approved

/**
 * Document source
 */
export type KnowledgeSource = 
  | 'telegram'   // Received via Telegram ingestion
  | 'manual'      // Manually created
  | 'imported';   // Imported from external source

/**
 * Knowledge document metadata
 */
export interface KnowledgeDocumentMetadata {
  author?: string;
  department?: string;
  validity?: string;
  [key: string]: unknown;
}

/**
 * Knowledge document (source content)
 */
export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  status: KnowledgeDocumentStatus;
  version: number;
  source: KnowledgeSource;
  sourceId?: string;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: Date;
  tags: string[];
  metadata: KnowledgeDocumentMetadata;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new knowledge document
 */
export interface CreateKnowledgeDocumentInput {
  title: string;
  content: string;
  category: KnowledgeCategory;
  source?: KnowledgeSource;
  sourceId?: string;
  tags?: string[];
  metadata?: KnowledgeDocumentMetadata;
  createdBy?: string;
}

/**
 * Input for updating a knowledge document
 */
export interface UpdateKnowledgeDocumentInput {
  id: string;
  title?: string;
  content?: string;
  category?: KnowledgeCategory;
  status?: KnowledgeDocumentStatus;
  tags?: string[];
  metadata?: KnowledgeDocumentMetadata;
  approvedBy?: string;
}

/**
 * Knowledge chunk (retrievable unit)
 */
export interface KnowledgeChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding?: number[];
  tokenCount?: number;
  title?: string;
  category: KnowledgeCategory;
  tags: string[];
  version: number;
  source: KnowledgeSource;
  relevance?: number; // Calculated during retrieval
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating knowledge chunks
 */
export interface CreateKnowledgeChunkInput {
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding?: number[];
  tokenCount?: number;
  title?: string;
  category: KnowledgeCategory;
  tags?: string[];
  version?: number;
  source?: KnowledgeSource;
}

/**
 * Search options for knowledge retrieval
 */
export interface KnowledgeSearchOptions {
  query: string;
  category?: KnowledgeCategory;
  tags?: string[];
  limit?: number;
  minRelevance?: number;
}

/**
 * Search result from knowledge retrieval
 */
export interface KnowledgeSearchResult {
  chunk: KnowledgeChunk;
  relevance: number;
  documentTitle?: string;
}

/**
 * Retrieval result returned by the retrieval service
 */
export interface RetrievalResult {
  id: string;
  content: string;
  source: string;
  relevance: number;
  category?: string;
  title?: string;
  documentVersion?: number;
}

/**
 * Fallback types for when retrieval fails
 */
export type FallbackType = 
  | 'no_knowledge'    // No relevant knowledge found
  | 'low_confidence' // Found but with low confidence
  | 'clarification'; // Need more information

/**
 * Configuration for retrieval service
 */
export interface RetrievalConfig {
  maxChunks: number;
  minRelevance: number;
  embeddingModel: string;
  embeddingDimensions: number;
  chunkSize: number;
  chunkOverlap: number;
}

/**
 * Vector store interface (abstraction for different backends)
 * This allows swapping between Qdrant, pgvector, Pinecone, etc.
 */
export interface VectorStoreInterface {
  /**
   * Initialize the vector store
   */
  initialize(): Promise<void>;
  
  /**
   * Add chunks to the vector store
   */
  addChunks(chunks: KnowledgeChunk[]): Promise<void>;
  
  /**
   * Search for similar chunks
   */
  search(
    query: string,
    embedding: number[],
    options: { limit: number; minRelevance: number; category?: string }
  ): Promise<KnowledgeSearchResult[]>;
  
  /**
   * Delete chunks by document ID
   */
  deleteByDocument(documentId: string): Promise<void>;
  
  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;
}
