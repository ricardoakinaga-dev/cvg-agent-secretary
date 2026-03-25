// Knowledge Retrieval Service
// Phase 3: RAG and Institutional Knowledge
// Provides abstraction layer for different vector store backends

import { logger } from '../logging';
import { openaiClient } from '../openai/client';
import { knowledgeRepository } from './repository';
import { metrics, METRICS } from '../../shared/metrics';
import { redisClient } from '../../shared/redis';
import {
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
  RetrievalResult,
  RetrievalConfig,
  VectorStoreInterface,
  KnowledgeCategory,
} from './types';

/**
 * Default retrieval configuration
 */
const DEFAULT_CONFIG: RetrievalConfig = {
  maxChunks: 5,
  minRelevance: 0.7,
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  chunkSize: 500,
  chunkOverlap: 50,
};

/**
 * Fallback Vector Store using PostgreSQL full-text search
 * This is used when no real vector store is available
 */
class PostgresFullTextStore implements VectorStoreInterface {
  async initialize(): Promise<void> {
    logger.info('PostgreSQL full-text store initialized (fallback mode)');
  }

  async addChunks(): Promise<void> {
    // Chunks are added via repository
    logger.debug('Chunks managed via repository, not vector store');
  }

  async search(
    _query: string,
    _embedding: number[],
    options: { limit: number; minRelevance: number; category?: string }
  ): Promise<KnowledgeSearchResult[]> {
    // Use repository's full-text search as fallback
    const chunks = await knowledgeRepository.searchChunksFullText({
      query: _query,
      category: options.category as KnowledgeCategory | undefined,
      limit: options.limit,
    });

    // Map to search results with computed relevance
    return chunks.map((chunk) => ({
      chunk,
      relevance: 0.8, // Default relevance for full-text search
      documentTitle: chunk.title,
    }));
  }

  async deleteByDocument(_documentId: string): Promise<void> {
    await knowledgeRepository.deleteChunksByDocument(_documentId);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await knowledgeRepository.getPublishedDocuments();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Main Knowledge Retrieval Service
 * Handles knowledge search with fallback support
 */
class KnowledgeRetrievalService {
  private config: RetrievalConfig;
  private vectorStore: VectorStoreInterface;
  private isInitialized: boolean = false;
  private useVectorStore: boolean = false;

  constructor() {
    this.config = DEFAULT_CONFIG;
    // Use PostgreSQL full-text search as default fallback
    this.vectorStore = new PostgresFullTextStore();
  }

  /**
   * Initialize the retrieval service
   * Checks if vector store is available and configures accordingly
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Try to initialize vector store
      await this.vectorStore.initialize();
      
      // Check if vector store is healthy
      const isHealthy = await this.vectorStore.healthCheck();
      if (isHealthy) {
        this.useVectorStore = true;
        logger.info('Knowledge retrieval service initialized with vector store');
      } else {
        logger.warn('Vector store not healthy, using PostgreSQL full-text fallback');
        this.useVectorStore = false;
      }
    } catch (error) {
      logger.warn('Vector store initialization failed, using PostgreSQL fallback', { error: error as Error });
      this.useVectorStore = false;
    }

    this.isInitialized = true;
  }

  /**
   * Search for relevant knowledge chunks
   */
  async search(options: KnowledgeSearchOptions): Promise<RetrievalResult[]> {
    const { 
      query, 
      category, 
      limit = this.config.maxChunks, 
      minRelevance = this.config.minRelevance 
    } = options;

    logger.info('Searching knowledge', { query, category, limit });

    try {
      let results: KnowledgeSearchResult[] = [];

      if (this.useVectorStore) {
        // Check embedding cache first
        let embedding: number[] | null = null;
        try {
          embedding = await redisClient.getEmbeddingCache(query);
          if (embedding) {
            metrics.incrementCounter(METRICS.KNOWLEDGE_SEARCH_TOTAL, { cache: 'hit' });
            logger.debug('Embedding cache hit', { query: query.substring(0, 50) });
          } else {
            metrics.incrementCounter(METRICS.KNOWLEDGE_SEARCH_TOTAL, { cache: 'miss' });
            logger.debug('Embedding cache miss', { query: query.substring(0, 50) });
          }
        } catch (cacheError) {
          logger.warn('Embedding cache read failed', { error: (cacheError as Error).message });
        }

        // Generate embedding if not cached
        if (!embedding) {
          embedding = await openaiClient.generateEmbedding(query);
          try {
            await redisClient.setEmbeddingCache(query, embedding);
          } catch (cacheError) {
            logger.warn('Embedding cache write failed', { error: (cacheError as Error).message });
          }
        }

        results = await this.vectorStore.search(query, embedding, {
          limit,
          minRelevance,
          category,
        });
      } else {
        // Fallback to PostgreSQL full-text search
        results = await this.vectorStore.search(query, [], {
          limit,
          minRelevance,
          category,
        }) as KnowledgeSearchResult[];
      }

      // Filter by minimum relevance
      const filteredResults = results.filter(r => r.relevance >= minRelevance);

      // Map to retrieval results
      const retrievalResults: RetrievalResult[] = filteredResults.map(r => ({
        id: r.chunk.id,
        content: r.chunk.content,
        source: r.chunk.source,
        relevance: r.relevance,
        category: r.chunk.category,
        title: r.chunk.title || r.documentTitle,
        documentVersion: r.chunk.version,
      }));

      logger.info('Knowledge search completed', {
        query,
        resultsCount: retrievalResults.length,
        hasVectorStore: this.useVectorStore,
      });

      return retrievalResults;
    } catch (error) {
      logger.error('Knowledge search failed', error as Error, { query });
      metrics.incrementCounter(METRICS.KNOWLEDGE_SEARCH_ERRORS, { error: 'search_failed' });
      
      // Try fallback to full-text search if vector store failed
      if (this.useVectorStore) {
        logger.info('Attempting fallback to full-text search');
        metrics.incrementCounter(METRICS.KNOWLEDGE_FALLBACK_USED);
        try {
          const fallbackResults = await knowledgeRepository.searchChunksFullText({
            query,
            category,
            limit,
          });

          return fallbackResults.map(chunk => ({
            id: chunk.id,
            content: chunk.content,
            source: chunk.source,
            relevance: 0.6, // Lower relevance for fallback
            category: chunk.category,
            title: chunk.title,
            documentVersion: chunk.version,
          }));
        } catch (fallbackError) {
          logger.error('Fallback search also failed', fallbackError as Error);
          metrics.incrementCounter(METRICS.KNOWLEDGE_SEARCH_ERRORS, { error: 'fallback_failed' });
        }
      }

      return [];
    }
  }

  /**
   * Check if the service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (this.useVectorStore) {
        return await this.vectorStore.healthCheck();
      }
      // At minimum, check database connectivity
      const docs = await knowledgeRepository.getPublishedDocuments();
      return docs !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get configuration status
   */
  getStatus(): { useVectorStore: boolean; isInitialized: boolean } {
    return {
      useVectorStore: this.useVectorStore,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Set custom vector store (for future Qdrant/pgvector integration)
   */
  setVectorStore(store: VectorStoreInterface): void {
    this.vectorStore = store;
    this.useVectorStore = true;
    logger.info('Custom vector store configured');
  }
}

export const knowledgeRetrievalService = new KnowledgeRetrievalService();
export { KnowledgeRetrievalService };
