// Knowledge Tools for Agent
// Phase 3: RAG and Institutional Knowledge

import { logger } from '../logging/index';
import { knowledgeRetrievalService } from './retrieval';
import {
  KnowledgeSearchOptions,
  KnowledgeCategory,
  RetrievalResult,
} from './types';

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
export async function searchKnowledge(input: SearchKnowledgeInput): Promise<SearchKnowledgeOutput> {
  try {
    logger.info('Tool search_knowledge called', { 
      query: input.query, 
      category: input.category 
    });

    // Validate input
    if (!input.query || input.query.trim().length === 0) {
      throw new Error('Query is required');
    }

    // Set up search options
    const options: KnowledgeSearchOptions = {
      query: input.query.trim(),
      category: input.category,
      limit: input.limit || 5,
      minRelevance: 0.7,
    };

    // Perform search
    const results = await knowledgeRetrievalService.search(options);

    logger.info('Tool search_knowledge completed', {
      query: input.query,
      resultsCount: results.length,
    });

    return {
      results,
      found: results.length > 0,
      count: results.length,
    };
  } catch (error) {
    logger.error('Tool search_knowledge failed', error as Error, { 
      query: input.query 
    });
    
    // Return empty result on error
    return {
      results: [],
      found: false,
      count: 0,
    };
  }
}

/**
 * Tool: get_knowledge_by_category
 * Gets all knowledge in a specific category
 */
export async function getKnowledgeByCategory(category: KnowledgeCategory): Promise<{
  success: boolean;
  category: KnowledgeCategory;
  documents: unknown[];
}> {
  try {
    const { knowledgeRepository } = await import('./repository');
    const documents = await knowledgeRepository.getPublishedDocuments();
    
    const filtered = documents.filter(d => d.category === category);

    return {
      success: true,
      category,
      documents: filtered,
    };
  } catch (error) {
    logger.error('Tool get_knowledge_by_category failed', error as Error, { 
      category 
    });
    
    return {
      success: false,
      category,
      documents: [],
    };
  }
}

/**
 * Export all knowledge tools
 */
export const knowledgeTools = {
  search_knowledge: searchKnowledge,
  get_knowledge_by_category: getKnowledgeByCategory,
};

export type KnowledgeToolName = keyof typeof knowledgeTools;
