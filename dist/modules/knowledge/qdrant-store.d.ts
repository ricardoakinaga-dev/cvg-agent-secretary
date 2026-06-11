import { KnowledgeChunk, KnowledgeSearchResult, VectorStoreInterface } from './types';
export declare class QdrantHybridStore implements VectorStoreInterface {
    initialize(): Promise<void>;
    addChunks(chunks: KnowledgeChunk[]): Promise<void>;
    search(query: string, embedding: number[], options: {
        limit: number;
        minRelevance: number;
        category?: string;
    }): Promise<KnowledgeSearchResult[]>;
    deleteByDocument(documentId: string): Promise<void>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=qdrant-store.d.ts.map