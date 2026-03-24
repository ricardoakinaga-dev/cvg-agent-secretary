import { KnowledgeCategory, RetrievalResult } from './types';
/**
 * Input for search_knowledge tool
 */
export interface SearchKnowledgeInput {
    query: string;
    category?: KnowledgeCategory;
    limit?: number;
}
/**
 * Output from search_knowledge tool
 */
export interface SearchKnowledgeOutput {
    results: RetrievalResult[];
    found: boolean;
    count: number;
}
/**
 * Tool: search_knowledge
 * Searches the knowledge base for relevant information
 */
export declare function searchKnowledge(input: SearchKnowledgeInput): Promise<SearchKnowledgeOutput>;
/**
 * Tool: get_knowledge_by_category
 * Gets all knowledge in a specific category
 */
export declare function getKnowledgeByCategory(category: KnowledgeCategory): Promise<{
    success: boolean;
    category: KnowledgeCategory;
    documents: unknown[];
}>;
/**
 * Export all knowledge tools
 */
export declare const knowledgeTools: {
    search_knowledge: typeof searchKnowledge;
    get_knowledge_by_category: typeof getKnowledgeByCategory;
};
export type KnowledgeToolName = keyof typeof knowledgeTools;
//# sourceMappingURL=tools.d.ts.map