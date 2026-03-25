"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedRAGService = exports.EnhancedRAGService = void 0;
const logging_1 = require("../logging");
const retrieval_1 = require("../knowledge/retrieval");
const DEFAULT_MERGE_OPTIONS = {
    maxContexts: 3,
    priorityWeight: 0.7,
    relevanceThreshold: 0.5,
};
class EnhancedRAGService {
    mergeOptions;
    constructor(options) {
        this.mergeOptions = { ...DEFAULT_MERGE_OPTIONS, ...options };
    }
    async analyzeQuery(query) {
        const lowerQuery = query.toLowerCase();
        const entities = [];
        const petPatterns = /(meu pet|meu cão|meu gato|meu animal|pet|cão|gato)/gi;
        const match = query.match(petPatterns);
        if (match)
            entities.push('pet_related');
        const schedulePatterns = /(horário|agenda|funcionamento|atendimento|hora|marcar|agendar)/gi;
        if (schedulePatterns.test(lowerQuery)) {
            entities.push('scheduling');
            return {
                entities,
                intent: 'scheduling',
                complexity: 'simple',
                requiresContext: false,
            };
        }
        const pricePatterns = /(preço|custo|valor|quanto|custa|consulta|exame)/gi;
        if (pricePatterns.test(lowerQuery)) {
            entities.push('pricing');
            return {
                entities,
                intent: 'pricing',
                complexity: 'simple',
                requiresContext: false,
            };
        }
        const medicalPatterns = /(sintoma|doença|tratamento|medicamento|remédio|vacina|exame)/gi;
        if (medicalPatterns.test(lowerQuery)) {
            entities.push('medical');
            return {
                entities,
                intent: 'medical_inquiry',
                complexity: 'complex',
                requiresContext: true,
            };
        }
        return {
            entities,
            intent: 'general',
            complexity: query.length > 100 ? 'complex' : 'simple',
            requiresContext: entities.length > 0,
        };
    }
    async rankChunks(query, chunks) {
        await this.analyzeQuery(query);
        const categoryWeights = {
            faq: 1.2,
            policy: 1.0,
            procedure: 1.1,
            service: 0.9,
            orientation: 0.8,
            instruction: 1.0,
        };
        const scoredChunks = chunks.map(chunk => {
            const categoryWeight = categoryWeights[chunk.category] || 1.0;
            const recencyBoost = 1.0;
            const contentDensity = this.calculateContentDensity(chunk.content, query);
            const baseScore = chunk.relevance * categoryWeight * recencyBoost;
            const densityScore = contentDensity * 0.3;
            const finalScore = (baseScore * 0.7) + densityScore;
            return {
                ...chunk,
                score: baseScore,
                combinedScore: Math.min(finalScore, 1.0),
            };
        });
        return scoredChunks
            .sort((a, b) => b.combinedScore - a.combinedScore)
            .slice(0, this.mergeOptions.maxContexts * 2);
    }
    calculateContentDensity(content, query) {
        const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
        if (queryTerms.length === 0)
            return 0.5;
        const contentLower = content.toLowerCase();
        const matches = queryTerms.filter(term => contentLower.includes(term)).length;
        return Math.min(matches / queryTerms.length, 1.0);
    }
    async mergeContexts(rankedChunks, query, conversationHistory) {
        const topChunks = rankedChunks.slice(0, this.mergeOptions.maxContexts);
        if (topChunks.length === 0) {
            return '';
        }
        const contextParts = [];
        if (conversationHistory.length > 0) {
            const recentMessages = conversationHistory.slice(-3);
            contextParts.push(`Conversa recente:\n${recentMessages.join('\n')}`);
        }
        const chunkSummaries = topChunks.map((chunk, idx) => {
            const priorityMarker = idx === 0 ? '📌 ' : '';
            return `${priorityMarker}${chunk.title}\n${chunk.content.substring(0, 300)}${chunk.content.length > 300 ? '...' : ''}`;
        });
        contextParts.push(`Conhecimento relevante:\n${chunkSummaries.join('\n\n')}`);
        const deduplicatedContext = this.deduplicateContext(contextParts.join('\n\n---\n\n'));
        return deduplicatedContext.length > 2000
            ? deduplicatedContext.substring(0, 2000) + '...'
            : deduplicatedContext;
    }
    deduplicateContext(context) {
        const lines = context.split('\n');
        const seen = new Set();
        const uniqueLines = [];
        for (const line of lines) {
            const normalized = line.toLowerCase().trim();
            if (!normalized || seen.has(normalized))
                continue;
            seen.add(normalized);
            uniqueLines.push(line);
        }
        return uniqueLines.join('\n');
    }
    async enhancedSearch(query, conversationHistory = [], options) {
        const searchResults = await retrieval_1.knowledgeRetrievalService.search({
            query,
            limit: options?.limit || 5,
            minRelevance: options?.minRelevance || this.mergeOptions.relevanceThreshold,
        });
        if (searchResults.length === 0) {
            return { context: '', chunks: [] };
        }
        const rankedChunks = await this.rankChunks(query, searchResults.map(r => ({
            id: r.id,
            content: r.content,
            title: r.title || '',
            source: r.source,
            category: r.category || 'general',
            relevance: r.relevance,
        })));
        const filteredChunks = rankedChunks.filter(c => c.combinedScore >= this.mergeOptions.relevanceThreshold);
        const mergedContext = await this.mergeContexts(filteredChunks, query, conversationHistory);
        logging_1.logger.info('Enhanced RAG search completed', {
            query: query.substring(0, 50),
            resultsFound: searchResults.length,
            chunksReturned: filteredChunks.length,
        });
        return {
            context: mergedContext,
            chunks: filteredChunks,
        };
    }
}
exports.EnhancedRAGService = EnhancedRAGService;
exports.enhancedRAGService = new EnhancedRAGService();
//# sourceMappingURL=rag.js.map