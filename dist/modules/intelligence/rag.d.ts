export interface QueryAnalysis {
    entities: string[];
    intent: string;
    complexity: 'simple' | 'moderate' | 'complex';
    requiresContext: boolean;
}
export interface ContextMergeOptions {
    maxContexts: number;
    priorityWeight: number;
    relevanceThreshold: number;
}
export interface RankedChunk {
    id: string;
    content: string;
    title: string;
    source: string;
    category: string;
    relevance: number;
    score: number;
    combinedScore: number;
}
export declare class EnhancedRAGService {
    private mergeOptions;
    constructor(options?: Partial<ContextMergeOptions>);
    analyzeQuery(query: string): Promise<QueryAnalysis>;
    rankChunks(query: string, chunks: Array<{
        id: string;
        content: string;
        title: string;
        source: string;
        category: string;
        relevance: number;
    }>): Promise<RankedChunk[]>;
    private calculateContentDensity;
    mergeContexts(rankedChunks: RankedChunk[], query: string, conversationHistory: string[]): Promise<string>;
    private deduplicateContext;
    enhancedSearch(query: string, conversationHistory?: string[], options?: {
        limit?: number;
        minRelevance?: number;
    }): Promise<{
        context: string;
        chunks: RankedChunk[];
    }>;
}
export declare const enhancedRAGService: EnhancedRAGService;
//# sourceMappingURL=rag.d.ts.map