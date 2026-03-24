"use strict";
// Knowledge Tools for Agent
// Phase 3: RAG and Institutional Knowledge
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeTools = void 0;
exports.searchKnowledge = searchKnowledge;
exports.getKnowledgeByCategory = getKnowledgeByCategory;
const index_1 = require("../logging/index");
const retrieval_1 = require("./retrieval");
/**
 * Tool: search_knowledge
 * Searches the knowledge base for relevant information
 */
async function searchKnowledge(input) {
    try {
        index_1.logger.info('Tool search_knowledge called', {
            query: input.query,
            category: input.category
        });
        // Validate input
        if (!input.query || input.query.trim().length === 0) {
            throw new Error('Query is required');
        }
        // Set up search options
        const options = {
            query: input.query.trim(),
            category: input.category,
            limit: input.limit || 5,
            minRelevance: 0.7,
        };
        // Perform search
        const results = await retrieval_1.knowledgeRetrievalService.search(options);
        index_1.logger.info('Tool search_knowledge completed', {
            query: input.query,
            resultsCount: results.length,
        });
        return {
            results,
            found: results.length > 0,
            count: results.length,
        };
    }
    catch (error) {
        index_1.logger.error('Tool search_knowledge failed', error, {
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
async function getKnowledgeByCategory(category) {
    try {
        const { knowledgeRepository } = await Promise.resolve().then(() => __importStar(require('./repository')));
        const documents = await knowledgeRepository.getPublishedDocuments();
        const filtered = documents.filter(d => d.category === category);
        return {
            success: true,
            category,
            documents: filtered,
        };
    }
    catch (error) {
        index_1.logger.error('Tool get_knowledge_by_category failed', error, {
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
exports.knowledgeTools = {
    search_knowledge: searchKnowledge,
    get_knowledge_by_category: getKnowledgeByCategory,
};
//# sourceMappingURL=tools.js.map