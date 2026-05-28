"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QdrantVectorStore = void 0;
const config_1 = require("../../config");
const logging_1 = require("../logging");
function chunkToPayload(chunk) {
    return {
        documentId: chunk.documentId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        title: chunk.title,
        category: chunk.category,
        tags: chunk.tags,
        version: chunk.version,
        source: chunk.source,
        isActive: chunk.isActive,
        createdAt: chunk.createdAt.toISOString(),
        updatedAt: chunk.updatedAt.toISOString(),
    };
}
function pointToSearchResult(point) {
    if (!point.payload)
        return null;
    return {
        relevance: point.score || 0,
        documentTitle: point.payload.title,
        chunk: {
            id: point.id,
            documentId: point.payload.documentId,
            chunkIndex: point.payload.chunkIndex,
            content: point.payload.content,
            tokenCount: point.payload.tokenCount,
            title: point.payload.title,
            category: point.payload.category,
            tags: point.payload.tags,
            version: point.payload.version,
            source: point.payload.source,
            isActive: point.payload.isActive,
            createdAt: new Date(point.payload.createdAt),
            updatedAt: new Date(point.payload.updatedAt),
        },
    };
}
class QdrantVectorStore {
    url;
    apiKey;
    collection;
    dimensions;
    constructor(dimensions) {
        this.url = config_1.config.qdrant.url.replace(/\/$/, '');
        this.apiKey = config_1.config.qdrant.apiKey;
        this.collection = config_1.config.qdrant.collection;
        this.dimensions = dimensions;
    }
    headers() {
        return {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'api-key': this.apiKey } : {}),
        };
    }
    async request(path, init = {}) {
        if (!this.url) {
            throw new Error('QDRANT_URL is not configured');
        }
        const response = await fetch(`${this.url}${path}`, {
            ...init,
            headers: {
                ...this.headers(),
                ...(init.headers || {}),
            },
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Qdrant API error: ${response.status} - ${errorText}`);
        }
        return response.json();
    }
    async initialize() {
        await this.request(`/collections/${this.collection}`, {
            method: 'PUT',
            body: JSON.stringify({
                vectors: {
                    size: this.dimensions,
                    distance: 'Cosine',
                },
            }),
        });
        logging_1.logger.info('Qdrant vector store initialized', {
            collection: this.collection,
            dimensions: this.dimensions,
        });
    }
    async addChunks(chunks) {
        const points = chunks
            .filter((chunk) => chunk.embedding && chunk.embedding.length > 0)
            .map((chunk) => ({
            id: chunk.id,
            vector: chunk.embedding,
            payload: chunkToPayload(chunk),
        }));
        if (points.length === 0) {
            return;
        }
        await this.request(`/collections/${this.collection}/points?wait=true`, {
            method: 'PUT',
            body: JSON.stringify({ points }),
        });
    }
    async search(_query, embedding, options) {
        const filter = options.category
            ? {
                must: [
                    {
                        key: 'category',
                        match: { value: options.category },
                    },
                ],
            }
            : undefined;
        const response = await this.request(`/collections/${this.collection}/points/search`, {
            method: 'POST',
            body: JSON.stringify({
                vector: embedding,
                limit: options.limit,
                score_threshold: options.minRelevance,
                with_payload: true,
                filter,
            }),
        });
        return (response.result || [])
            .map(pointToSearchResult)
            .filter((result) => result !== null);
    }
    async deleteByDocument(documentId) {
        await this.request(`/collections/${this.collection}/points/delete?wait=true`, {
            method: 'POST',
            body: JSON.stringify({
                filter: {
                    must: [
                        {
                            key: 'documentId',
                            match: { value: documentId },
                        },
                    ],
                },
            }),
        });
    }
    async healthCheck() {
        try {
            await this.request(`/collections/${this.collection}`);
            return true;
        }
        catch (error) {
            logging_1.logger.warn('Qdrant health check failed', { error: error.message });
            return false;
        }
    }
}
exports.QdrantVectorStore = QdrantVectorStore;
//# sourceMappingURL=qdrant.js.map