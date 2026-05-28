// Knowledge Pipeline Helper
// Phase 2: Connects chunking to publication flow

import { knowledgeRepository } from './repository';
import { KnowledgeDocument } from './types';
import { chunkDocument, generateChunkEmbeddings } from './chunking';
import { knowledgeRetrievalService } from './retrieval';

export async function createChunksForDocument(
  document: KnowledgeDocument,
  generateEmbeddings = true
): Promise<number> {
  const chunks = await chunkDocument(document);
  
  if (chunks.length === 0) {
    return 0;
  }

  if (generateEmbeddings) {
    try {
      await generateChunkEmbeddings(chunks);
    } catch {
      console.warn('Failed to generate embeddings, continuing without them');
    }
  }

  const created = await knowledgeRepository.createChunks(chunks);
  await knowledgeRetrievalService.addChunks(created);
  return created.length;
}
