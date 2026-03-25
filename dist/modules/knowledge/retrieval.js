"use strict";
// Knowledge Retrieval Service
// Phase 3: RAG and Institutional Knowledge
// Provides abstraction layer for different vector store backends
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeRetrievalService = exports.knowledgeRetrievalService = void 0;
const logging_1 = require("../logging");
const client_1 = require("../openai/client");
const repository_1 = require("./repository");
const metrics_1 = require("../../shared/metrics");
const redis_1 = require("../../shared/redis");
/**
 * Default retrieval configuration
 */
const DEFAULT_CONFIG = {
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
class PostgresFullTextStore {
    async initialize() {
        logging_1.logger.info('PostgreSQL full-text store initialized (fallback mode)');
    }
    async addChunks() {
        // Chunks are added via repository
        logging_1.logger.debug('Chunks managed via repository, not vector store');
    }
    async search(_query, _embedding, options) {
        // Use repository's full-text search as fallback
        const chunks = await repository_1.knowledgeRepository.searchChunksFullText({
            query: _query,
            category: options.category,
            limit: options.limit,
        });
        // Map to search results with computed relevance
        return chunks.map((chunk) => ({
            chunk,
            relevance: 0.8, // Default relevance for full-text search
            documentTitle: chunk.title,
        }));
    }
    async deleteByDocument(_documentId) {
        await repository_1.knowledgeRepository.deleteChunksByDocument(_documentId);
    }
    async healthCheck() {
        try {
            await repository_1.knowledgeRepository.getPublishedDocuments();
            return true;
        }
        catch {
            return false;
        }
    }
}
/**
 * Main Knowledge Retrieval Service
 * Handles knowledge search with fallback support
 */
class KnowledgeRetrievalService {
    config;
    vectorStore;
    isInitialized = false;
    useVectorStore = false;
    constructor() {
        this.config = DEFAULT_CONFIG;
        // Use PostgreSQL full-text search as default fallback
        this.vectorStore = new PostgresFullTextStore();
    }
    /**
     * Initialize the retrieval service
     * Checks if vector store is available and configures accordingly
     */
    async initialize() {
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
                logging_1.logger.info('Knowledge retrieval service initialized with vector store');
            }
            else {
                logging_1.logger.warn('Vector store not healthy, using PostgreSQL full-text fallback');
                this.useVectorStore = false;
            }
        }
        catch (error) {
            logging_1.logger.warn('Vector store initialization failed, using PostgreSQL fallback', { error: error });
            this.useVectorStore = false;
        }
        this.isInitialized = true;
    }
    /**
     * Search for relevant knowledge chunks
     */
    async search(options) {
        const { query, category, limit = this.config.maxChunks, minRelevance = this.config.minRelevance } = options;
        logging_1.logger.info('Searching knowledge', { query, category, limit });
        try {
            let results = [];
            if (this.useVectorStore) {
                // Check embedding cache first
                let embedding = null;
                try {
                    embedding = await redis_1.redisClient.getEmbeddingCache(query);
                    if (embedding) {
                        metrics_1.metrics.incrementCounter(metrics_1.METRICS.KNOWLEDGE_SEARCH_TOTAL, { cache: 'hit' });
                        logging_1.logger.debug('Embedding cache hit', { query: query.substring(0, 50) });
                    }
                    else {
                        metrics_1.metrics.incrementCounter(metrics_1.METRICS.KNOWLEDGE_SEARCH_TOTAL, { cache: 'miss' });
                        logging_1.logger.debug('Embedding cache miss', { query: query.substring(0, 50) });
                    }
                }
                catch (cacheError) {
                    logging_1.logger.warn('Embedding cache read failed', { error: cacheError.message });
                }
                // Generate embedding if not cached
                if (!embedding) {
                    embedding = await client_1.openaiClient.generateEmbedding(query);
                    try {
                        await redis_1.redisClient.setEmbeddingCache(query, embedding);
                    }
                    catch (cacheError) {
                        logging_1.logger.warn('Embedding cache write failed', { error: cacheError.message });
                    }
                }
                results = await this.vectorStore.search(query, embedding, {
                    limit,
                    minRelevance,
                    category,
                });
            }
            else {
                // Fallback to PostgreSQL full-text search
                results = await this.vectorStore.search(query, [], {
                    limit,
                    minRelevance,
                    category,
                });
            }
            // Filter by minimum relevance
            const filteredResults = results.filter(r => r.relevance >= minRelevance);
            // Map to retrieval results
            const retrievalResults = filteredResults.map(r => ({
                id: r.chunk.id,
                content: r.chunk.content,
                source: r.chunk.source,
                relevance: r.relevance,
                category: r.chunk.category,
                title: r.chunk.title || r.documentTitle,
                documentVersion: r.chunk.version,
            }));
            logging_1.logger.info('Knowledge search completed', {
                query,
                resultsCount: retrievalResults.length,
                hasVectorStore: this.useVectorStore,
            });
            return retrievalResults;
        }
        catch (error) {
            logging_1.logger.error('Knowledge search failed', error, { query });
            metrics_1.metrics.incrementCounter(metrics_1.METRICS.KNOWLEDGE_SEARCH_ERRORS, { error: 'search_failed' });
            // Try fallback to full-text search if vector store failed
            if (this.useVectorStore) {
                logging_1.logger.info('Attempting fallback to full-text search');
                metrics_1.metrics.incrementCounter(metrics_1.METRICS.KNOWLEDGE_FALLBACK_USED);
                try {
                    const fallbackResults = await repository_1.knowledgeRepository.searchChunksFullText({
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
                }
                catch (fallbackError) {
                    logging_1.logger.error('Fallback search also failed', fallbackError);
                    metrics_1.metrics.incrementCounter(metrics_1.METRICS.KNOWLEDGE_SEARCH_ERRORS, { error: 'fallback_failed' });
                }
            }
            return [];
        }
    }
    /**
     * Check if the service is healthy
     */
    async healthCheck() {
        try {
            if (this.useVectorStore) {
                return await this.vectorStore.healthCheck();
            }
            // At minimum, check database connectivity
            const docs = await repository_1.knowledgeRepository.getPublishedDocuments();
            return docs !== null;
        }
        catch {
            return false;
        }
    }
    /**
     * Get configuration status
     */
    getStatus() {
        return {
            useVectorStore: this.useVectorStore,
            isInitialized: this.isInitialized,
        };
    }
    /**
     * Set custom vector store (for future Qdrant/pgvector integration)
     */
    setVectorStore(store) {
        this.vectorStore = store;
        this.useVectorStore = true;
        logging_1.logger.info('Custom vector store configured');
    }
}
exports.KnowledgeRetrievalService = KnowledgeRetrievalService;
exports.knowledgeRetrievalService = new KnowledgeRetrievalService();
//# sourceMappingURL=retrieval.js.map