import { KnowledgeChunk, KnowledgeSearchResult, VectorStoreInterface } from './types';
export declare class QdrantVectorStore implements VectorStoreInterface {
    private url;
    private apiKey;
    private collection;
    private dimensions;
    constructor(dimensions: number);
    private headers;
    private request;
    initialize(): Promise<void>;
    addChunks(chunks: KnowledgeChunk[]): Promise<void>;
    search(_query: string, embedding: number[], options: {
        limit: number;
        minRelevance: number;
        category?: string;
    }): Promise<KnowledgeSearchResult[]>;
    deleteByDocument(documentId: string): Promise<void>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=qdrant.d.ts.map