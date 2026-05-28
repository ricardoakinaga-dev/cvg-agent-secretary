"use strict";
// Knowledge Chunking Service
// Phase 2: Real chunking in the knowledge pipeline
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunkDocument = chunkDocument;
exports.generateChunkEmbeddings = generateChunkEmbeddings;
const client_1 = require("../openai/client");
const logging_1 = require("../logging");
const DEFAULT_OPTIONS = {
    chunkSize: 500,
    chunkOverlap: 50,
    generateEmbeddings: true,
};
async function chunkDocument(document, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const content = document.content;
    if (!content || content.trim().length === 0) {
        console.warn(`Document has no content to chunk: ${document.id}`);
        return [];
    }
    const chunks = [];
    const words = content.split(/\s+/);
    let currentChunk = [];
    let currentLength = 0;
    let chunkIndex = 0;
    for (const word of words) {
        const wordLength = word.length + 1;
        if (currentLength + wordLength > opts.chunkSize && currentChunk.length > 0) {
            chunks.push(createChunkInput(document, currentChunk.join(' '), chunkIndex));
            chunkIndex++;
            const overlapWords = currentChunk.slice(-Math.floor(opts.chunkOverlap / 5));
            currentChunk = [...overlapWords];
            currentLength = overlapWords.join(' ').length;
        }
        currentChunk.push(word);
        currentLength += wordLength;
    }
    if (currentChunk.length > 0) {
        chunks.push(createChunkInput(document, currentChunk.join(' '), chunkIndex));
    }
    logging_1.logger.info('Document chunked', {
        documentId: document.id,
        chunksCount: chunks.length,
    });
    return chunks;
}
function createChunkInput(document, content, chunkIndex) {
    return {
        documentId: document.id,
        chunkIndex,
        content,
        title: document.title,
        category: document.category,
        tags: document.tags,
        version: document.version,
        source: document.source,
    };
}
async function generateChunkEmbeddings(chunks) {
    for (const chunk of chunks) {
        try {
            const embedding = await client_1.openaiClient.generateEmbedding(chunk.content);
            chunk.embedding = embedding;
            chunk.tokenCount = Math.ceil(chunk.content.split(/\s+/).length * 1.3);
        }
        catch (error) {
            console.warn(`Failed to generate embedding for chunk ${chunk.chunkIndex}: ${error.message}`);
        }
    }
}
//# sourceMappingURL=chunking.js.map