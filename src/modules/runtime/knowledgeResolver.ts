import { KnowledgeChunk } from '../../shared/types';
import {
  buildKnowledgeContext,
  hasHoursEvidence,
  hasPriceEvidence,
  isHoursQuery,
  isPricingQuery,
} from '../knowledge/context';
import { knowledgeRetrievalService } from '../knowledge/retrieval';
import { logger } from '../logging';

export async function resolveKnowledge(params: {
  query: string;
  intent: string;
  shouldUseKnowledge: boolean;
}): Promise<KnowledgeChunk[]> {
  const { query, intent, shouldUseKnowledge } = params;
  if (!shouldUseKnowledge) {
    logger.info('Knowledge search skipped by intent decision', { intent });
    return [];
  }

  try {
    const searchResults = await knowledgeRetrievalService.search({
      query,
      limit: 3,
      minRelevance: 0.7,
    });
    const rawResults: KnowledgeChunk[] = searchResults.map(result => ({
      id: result.id,
      content: result.content,
      source: result.source,
      relevance: result.relevance,
      category: result.category,
      title: result.title,
    }));
    const knowledge = buildKnowledgeContext(query, rawResults);

    logger.info('Knowledge search completed', {
      resultsCount: knowledge.length,
      pricingQuery: isPricingQuery(query),
      hasPriceEvidence: hasPriceEvidence(knowledge),
      hoursQuery: isHoursQuery(query),
      hasHoursEvidence: hasHoursEvidence(knowledge),
    });
    return knowledge;
  } catch (error) {
    logger.error('Knowledge search failed', error as Error, {});
    return [];
  }
}
