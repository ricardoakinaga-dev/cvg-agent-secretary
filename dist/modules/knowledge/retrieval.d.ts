import { KnowledgeSearchOptions, RetrievalResult, VectorStoreInterface } from './types';
/**
 * Main Knowledge Retrieval Service
 * Handles knowledge search with fallback support
 */
declare class KnowledgeRetrievalService {
    private config;
    private vectorStore;
    private isInitialized;
    private useVectorStore;
    constructor();
    /**
     * Initialize the retrieval service
     * Checks if vector store is available and configures accordingly
     */
    initialize(): Promise<void>;
    /**
     * Search for relevant knowledge chunks
     */
    search(options: KnowledgeSearchOptions): Promise<RetrievalResult[]>;
    addChunks(chunks: import('./types').KnowledgeChunk[]): Promise<void>;
    /**
     * Check if the service is healthy
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get configuration status
     */
    getStatus(): {
        useVectorStore: boolean;
        isInitialized: boolean;
    };
    /**
     * Set custom vector store (for future Qdrant/pgvector integration)
     */
    setVectorStore(store: VectorStoreInterface): void;
}
export declare const knowledgeRetrievalService: KnowledgeRetrievalService;
export { KnowledgeRetrievalService };
//# sourceMappingURL=retrieval.d.ts.map