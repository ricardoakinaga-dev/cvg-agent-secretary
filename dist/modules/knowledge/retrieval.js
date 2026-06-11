"use strict";
// Knowledge Retrieval Service
// Phase 3: RAG and Institutional Knowledge
// Provides abstraction layer for different vector store backends
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeRetrievalService = exports.knowledgeRetrievalService = void 0;
const logging_1 = require("../logging");
const config_1 = require("../../config");
const client_1 = require("../openai/client");
const repository_1 = require("./repository");
const metrics_1 = require("../../shared/metrics");
const redis_1 = require("../../shared/redis");
const qdrant_store_1 = require("./qdrant-store");
const context_1 = require("./context");
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
function buildVectorSearchQuery(query) {
    if (!(0, context_1.isHoursQuery)(query)) {
        if (/\bconsulta\b/i.test(query) && /\bcomo\s+funciona\b/i.test(query)) {
            return [
                'Centro Veterinario Guarapiranga',
                'recepcao jornada tutor consulta agendada encaixe atendimento prioritario',
                'cadastro nome tutor telefone nome pet especie queixa principal',
                query,
            ].join(' ');
        }
        return query;
    }
    return [
        'Centro Veterinario Guarapiranga',
        'horario atendimento consulta',
        'atendimento veterinario 24h 7 dias por semana',
        query,
    ].join(' ');
}
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
        this.vectorStore = config_1.config.knowledge.vectorStore === 'qdrant'
            ? new qdrant_store_1.QdrantHybridStore()
            : new PostgresFullTextStore();
    }
    async generateValidEmbedding(query) {
        let lastError = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                const embedding = await client_1.openaiClient.generateEmbedding(query);
                if (embedding.length === this.config.embeddingDimensions) {
                    return embedding;
                }
                lastError = new Error(`Invalid embedding dimension: expected ${this.config.embeddingDimensions}, got ${embedding.length}`);
                logging_1.logger.warn('Generated embedding has invalid dimension', {
                    attempt,
                    expected: this.config.embeddingDimensions,
                    actual: embedding.length,
                });
            }
            catch (error) {
                lastError = error;
                logging_1.logger.warn('Embedding generation failed', {
                    attempt,
                    error: lastError.message,
                });
            }
        }
        throw lastError || new Error('Embedding generation failed');
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
                this.vectorStore = new PostgresFullTextStore();
                await this.vectorStore.initialize();
                this.useVectorStore = false;
                this.vectorStore = new PostgresFullTextStore();
            }
        }
        catch (error) {
            logging_1.logger.warn('Vector store initialization failed, using PostgreSQL fallback', { error: error });
            this.vectorStore = new PostgresFullTextStore();
            await this.vectorStore.initialize();
            this.useVectorStore = false;
            this.vectorStore = new PostgresFullTextStore();
        }
        this.isInitialized = true;
    }
    /**
     * Search for relevant knowledge chunks
     */
    async search(options) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        const { query, category, limit = this.config.maxChunks, minRelevance = this.config.minRelevance } = options;
        logging_1.logger.info('Searching knowledge', { query, category, limit });
        try {
            let results = [];
            const vectorSearchQuery = buildVectorSearchQuery(query);
            if (config_1.config.knowledge.vectorStore === 'qdrant' && this.useVectorStore) {
                // Check embedding cache first
                let embedding = null;
                try {
                    embedding = await redis_1.redisClient.getEmbeddingCache(vectorSearchQuery);
                    if (embedding && embedding.length === this.config.embeddingDimensions) {
                        metrics_1.metrics.incrementCounter(metrics_1.METRICS.KNOWLEDGE_SEARCH_TOTAL, { cache: 'hit' });
                        logging_1.logger.debug('Embedding cache hit', { query: vectorSearchQuery.substring(0, 50) });
                    }
                    else {
                        embedding = null;
                        metrics_1.metrics.incrementCounter(metrics_1.METRICS.KNOWLEDGE_SEARCH_TOTAL, { cache: 'miss' });
                        logging_1.logger.debug('Embedding cache miss', { query: vectorSearchQuery.substring(0, 50) });
                    }
                }
                catch (cacheError) {
                    logging_1.logger.warn('Embedding cache read failed', { error: cacheError.message });
                }
                // Generate embedding if not cached
                if (!embedding) {
                    embedding = await this.generateValidEmbedding(vectorSearchQuery);
                    try {
                        await redis_1.redisClient.setEmbeddingCache(vectorSearchQuery, embedding);
                    }
                    catch (cacheError) {
                        logging_1.logger.warn('Embedding cache write failed', { error: cacheError.message });
                    }
                }
                if (embedding.length !== this.config.embeddingDimensions) {
                    throw new Error(`Invalid embedding dimension before vector search: expected ${this.config.embeddingDimensions}, got ${embedding.length}`);
                }
                results = await this.vectorStore.search(vectorSearchQuery, embedding, {
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
            if (config_1.config.knowledge.vectorStore === 'qdrant' && this.useVectorStore) {
                logging_1.logger.info('Attempting fallback to full-text search');
                metrics_1.metrics.incrementCounter(metrics_1.METRICS.KNOWLEDGE_FALLBACK_USED);
                try {
                    const fallbackResults = await repository_1.knowledgeRepository.searchChunksFullText({
                        query,
                        category,
                        limit,
                    });
                    return fallbackResults
                        .map(chunk => ({
                        id: chunk.id,
                        content: chunk.content,
                        source: chunk.source,
                        relevance: 0.6, // Lower relevance for fallback
                        category: chunk.category,
                        title: chunk.title,
                        documentVersion: chunk.version,
                    }))
                        .filter(result => result.relevance >= minRelevance);
                }
                catch (fallbackError) {
                    logging_1.logger.error('Fallback search also failed', fallbackError);
                    metrics_1.metrics.incrementCounter(metrics_1.METRICS.KNOWLEDGE_SEARCH_ERRORS, { error: 'fallback_failed' });
                }
            }
            return [];
        }
    }
    async addChunks(chunks) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        if (!this.useVectorStore) {
            return;
        }
        try {
            await this.vectorStore.addChunks(chunks);
        }
        catch (error) {
            logging_1.logger.warn('Failed to add chunks to vector store', {
                error: error.message,
            });
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