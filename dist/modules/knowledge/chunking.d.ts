import { CreateKnowledgeChunkInput, KnowledgeDocument } from './types';
export interface ChunkingOptions {
    chunkSize?: number;
    chunkOverlap?: number;
    generateEmbeddings?: boolean;
}
export declare function chunkDocument(document: KnowledgeDocument, options?: ChunkingOptions): Promise<CreateKnowledgeChunkInput[]>;
export declare function generateChunkEmbeddings(chunks: CreateKnowledgeChunkInput[]): Promise<void>;
//# sourceMappingURL=chunking.d.ts.map