"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QdrantHybridStore = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../../config");
const logging_1 = require("../logging");
const SPARSE_MODULUS = 100_000;
const STOP_WORDS = new Set([
    'a', 'ao', 'aos', 'as', 'ate', 'até', 'com', 'como', 'da', 'das', 'de', 'do', 'dos',
    'e', 'em', 'essa', 'esse', 'esta', 'este', 'foi', 'na', 'nas', 'no', 'nos', 'o', 'os',
    'ou', 'para', 'por', 'qual', 'quais', 'quando', 'quanto', 'que', 'se', 'sem', 'ser',
    'sao', 'são', 'sua', 'suas', 'seu', 'seus', 'uma', 'um', 'usa', 'usada', 'usado',
    'utiliza', 'utilizado',
]);
function tokenize(text) {
    const matches = text.toLowerCase().match(/\w{2,}/g) || [];
    return matches.filter((token) => !STOP_WORDS.has(token));
}
function sparseHash(token) {
    const digest = crypto_1.default.createHash('md5').update(token).digest('hex');
    return Number(BigInt(`0x${digest}`) % BigInt(SPARSE_MODULUS));
}
function createSparseVector(text) {
    const scores = new Map();
    for (const token of tokenize(text)) {
        const index = sparseHash(token);
        scores.set(index, (scores.get(index) || 0) + 1);
    }
    if (scores.size === 0) {
        return null;
    }
    return {
        indices: Array.from(scores.keys()),
        values: Array.from(scores.values()),
    };
}
function clamp01(n) {
    return Math.max(0, Math.min(1, n));
}
function resolveCollection() {
    return config_1.config.qdrant.collection.trim() || 'cvg_institucional';
}
function resolveVectorName() {
    return config_1.config.qdrant.vectorName.trim() || 'dense';
}
function resolveSearchMode() {
    return 'hybrid';
}
function resolveSparseVectorName() {
    return config_1.config.qdrant.sparseVectorName.trim() || 'sparse';
}
function resolvePrefetchLimit(topK) {
    const configured = Number(config_1.config.qdrant.prefetchLimit);
    if (!Number.isFinite(configured) || configured <= 0) {
        return Math.max(topK * 4, 20);
    }
    return Math.max(Math.floor(configured), topK);
}
function resolveScoreThreshold() {
    const configured = Number(config_1.config.qdrant.scoreThreshold);
    if (!Number.isFinite(configured)) {
        return 0;
    }
    return clamp01(configured);
}
function textPayload(payload) {
    return String(payload.text || payload.content || '');
}
function stringArray(value) {
    return Array.isArray(value) ? value.map(String) : [];
}
function pointToChunk(point) {
    const payload = point.payload || {};
    const content = textPayload(payload);
    if (!content.trim()) {
        return null;
    }
    return {
        id: String(payload.chunk_id || point.id),
        documentId: String(payload.document_id || payload.documentId || point.id),
        chunkIndex: Number(payload.chunk_index || payload.chunkIndex || 0),
        content,
        tokenCount: undefined,
        title: String(payload.title || payload.document_title || payload.source || ''),
        category: String(payload.category || 'faq'),
        tags: stringArray(payload.tags),
        version: Number(payload.version || 1),
        source: String(payload.source || 'imported'),
        relevance: Number(point.score || 0),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}
async function qdrantRequest(path, init) {
    const response = await fetch(`${config_1.config.qdrant.url}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
        },
    });
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Qdrant request failed (${response.status}): ${detail}`);
    }
    return response.json();
}
function denseSearchBody(embedding, topK) {
    const vectorName = resolveVectorName();
    const scoreThreshold = resolveScoreThreshold();
    const thresholdApplied = scoreThreshold > 0;
    const body = {
        vector: vectorName ? { name: vectorName, vector: embedding } : embedding,
        limit: topK,
        with_payload: true,
        with_vector: false,
    };
    if (thresholdApplied) {
        body.score_threshold = scoreThreshold;
    }
    return body;
}
async function searchQdrant(embedding, topK = 8, queryText = '') {
    const collection = resolveCollection();
    const vectorName = resolveVectorName();
    const searchMode = resolveSearchMode();
    const sparseVectorName = resolveSparseVectorName();
    const prefetchLimit = resolvePrefetchLimit(topK);
    const scoreThreshold = resolveScoreThreshold();
    const thresholdApplied = scoreThreshold > 0;
    const denseBody = denseSearchBody(embedding, topK);
    try {
        const sparseQuery = searchMode === 'hybrid' ? createSparseVector(queryText) : null;
        const useHybrid = searchMode === 'hybrid' && Boolean(vectorName) && Boolean(sparseQuery);
        const response = useHybrid
            ? await qdrantRequest(`/collections/${collection}/points/query`, {
                method: 'POST',
                body: JSON.stringify({
                    prefetch: [
                        {
                            query: sparseQuery,
                            using: sparseVectorName,
                            limit: prefetchLimit,
                        },
                        {
                            query: embedding,
                            using: vectorName,
                            limit: prefetchLimit,
                        },
                    ],
                    query: { fusion: 'rrf' },
                    limit: topK,
                    with_payload: true,
                    with_vector: false,
                }),
            })
            : await qdrantRequest(`/collections/${collection}/points/search`, {
                method: 'POST',
                body: JSON.stringify(denseBody),
            });
        const results = useHybrid
            ? response.result?.points || []
            : response.result || [];
        logging_1.logger.info('Qdrant search success', {
            collection,
            vectorName,
            sparseVectorName: useHybrid ? sparseVectorName : undefined,
            searchMode: useHybrid ? 'hybrid' : 'dense',
            topK,
            prefetchLimit: useHybrid ? prefetchLimit : undefined,
            scoreThreshold,
            thresholdApplied,
            hits: results.length,
            topScore: results[0]?.score ?? null,
        });
        return results;
    }
    catch (error) {
        logging_1.logger.error('Qdrant search failed', error, {
            collection,
            vectorName,
            sparseVectorName,
            searchMode,
            url: config_1.config.qdrant.url,
        });
        if (searchMode === 'hybrid') {
            logging_1.logger.warn('Qdrant hybrid search failed, falling back to dense search', {
                collection,
                vectorName,
                sparseVectorName,
            });
            const fallbackResponse = await qdrantRequest(`/collections/${collection}/points/search`, {
                method: 'POST',
                body: JSON.stringify(denseBody),
            });
            const fallbackResults = fallbackResponse.result || [];
            return Array.isArray(fallbackResults) ? fallbackResults : [];
        }
        return [];
    }
}
class QdrantHybridStore {
    async initialize() {
        if (await this.healthCheck()) {
            logging_1.logger.info('Qdrant hybrid store initialized', {
                collection: config_1.config.qdrant.collection,
                readOnly: config_1.config.qdrant.readOnly,
            });
            return;
        }
        if (!config_1.config.qdrant.createCollection) {
            throw new Error(`Qdrant collection not available: ${config_1.config.qdrant.collection}`);
        }
        await qdrantRequest(`/collections/${config_1.config.qdrant.collection}`, {
            method: 'PUT',
            body: JSON.stringify({
                vectors: {
                    [config_1.config.qdrant.vectorName]: {
                        size: 1536,
                        distance: 'Cosine',
                    },
                },
                sparse_vectors: {
                    [config_1.config.qdrant.sparseVectorName]: {},
                },
            }),
        });
    }
    async addChunks(chunks) {
        if (config_1.config.qdrant.readOnly || chunks.length === 0) {
            return;
        }
        const points = chunks
            .filter((chunk) => chunk.embedding && chunk.embedding.length > 0)
            .map((chunk) => ({
            id: chunk.id,
            vector: {
                [config_1.config.qdrant.vectorName]: chunk.embedding,
                [config_1.config.qdrant.sparseVectorName]: createSparseVector(chunk.content),
            },
            payload: {
                chunk_id: chunk.id,
                document_id: chunk.documentId,
                chunk_index: chunk.chunkIndex,
                text: chunk.content,
                title: chunk.title,
                category: chunk.category,
                tags: chunk.tags,
                version: chunk.version,
                source: chunk.source,
            },
        }))
            .filter((point) => point.vector[config_1.config.qdrant.sparseVectorName] !== null);
        if (points.length === 0) {
            return;
        }
        await qdrantRequest(`/collections/${config_1.config.qdrant.collection}/points?wait=true`, {
            method: 'PUT',
            body: JSON.stringify({ points }),
        });
    }
    async search(query, embedding, options) {
        if (embedding.length !== 1536) {
            throw new Error(`Invalid Qdrant dense vector dimension: expected 1536, got ${embedding.length}`);
        }
        const points = await searchQdrant(embedding, options.limit, query);
        const results = [];
        for (const point of points) {
            const chunk = pointToChunk(point);
            if (!chunk) {
                continue;
            }
            results.push({
                chunk,
                relevance: Math.max(Number(point.score || 0), options.minRelevance),
                documentTitle: chunk.title,
            });
        }
        return results;
    }
    async deleteByDocument(documentId) {
        if (config_1.config.qdrant.readOnly) {
            return;
        }
        await qdrantRequest(`/collections/${config_1.config.qdrant.collection}/points/delete?wait=true`, {
            method: 'POST',
            body: JSON.stringify({
                filter: {
                    must: [{ key: 'document_id', match: { value: documentId } }],
                },
            }),
        });
    }
    async healthCheck() {
        try {
            await qdrantRequest(`/collections/${config_1.config.qdrant.collection}`);
            return true;
        }
        catch (error) {
            logging_1.logger.warn('Qdrant health check failed', { error: error.message });
            return false;
        }
    }
}
exports.QdrantHybridStore = QdrantHybridStore;
//# sourceMappingURL=qdrant-store.js.map