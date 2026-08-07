// Knowledge Pipeline Helper
// Phase 2: Connects chunking to publication flow

import { knowledgeRepository } from './repository';
import { CreateKnowledgeChunkInput, KnowledgeChunk, KnowledgeDocument } from './types';
import { chunkDocument, generateChunkEmbeddings } from './chunking';
import { knowledgeRetrievalService } from './retrieval';

export async function prepareChunksForDocument(
  document: KnowledgeDocument,
  generateEmbeddings = true
): Promise<CreateKnowledgeChunkInput[]> {
  // Chunking failures are publication failures and must propagate to the caller.
  const chunks = await chunkDocument(document);

  if (generateEmbeddings && chunks.length > 0) {
    try {
      await generateChunkEmbeddings(chunks);
    } catch {
      console.warn('Failed to generate embeddings, continuing without them');
    }
  }

  return chunks;
}

export async function indexChunksInVectorStore(chunks: KnowledgeChunk[]): Promise<void> {
  try {
    await knowledgeRetrievalService.addChunks(chunks);
  } catch (error) {
    console.warn('Failed to index chunks in vector store:', (error as Error).message);
  }
}

export async function createChunksForDocument(
  document: KnowledgeDocument,
  generateEmbeddings = true
): Promise<number> {
  const chunks = await prepareChunksForDocument(document, generateEmbeddings);

  if (chunks.length === 0) {
    return 0;
  }

  const created = await knowledgeRepository.createChunks(chunks);
  await indexChunksInVectorStore(created);

  return created.length;
}
