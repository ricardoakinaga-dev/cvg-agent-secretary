"use strict";
// Knowledge Pipeline Helper
// Phase 2: Connects chunking to publication flow
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChunksForDocument = createChunksForDocument;
const repository_1 = require("./repository");
const chunking_1 = require("./chunking");
const retrieval_1 = require("./retrieval");
async function createChunksForDocument(document, generateEmbeddings = true) {
    const chunks = await (0, chunking_1.chunkDocument)(document);
    if (chunks.length === 0) {
        return 0;
    }
    if (generateEmbeddings) {
        try {
            await (0, chunking_1.generateChunkEmbeddings)(chunks);
        }
        catch {
            console.warn('Failed to generate embeddings, continuing without them');
        }
    }
    const created = await repository_1.knowledgeRepository.createChunks(chunks);
    try {
        await retrieval_1.knowledgeRetrievalService.addChunks(created);
    }
    catch (error) {
        console.warn('Failed to index chunks in vector store:', error.message);
    }
    return created.length;
}
//# sourceMappingURL=pipeline.js.map