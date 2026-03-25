// Knowledge Module - RAG and Institutional Knowledge
// Phase 3: RAG and Institutional Knowledge

export * from './types';
export * from './repository';
export * from './retrieval';
export * from './tools';

// Initialize the knowledge retrieval service
import { knowledgeRetrievalService } from './retrieval';

export async function initializeKnowledgeModule(): Promise<void> {
  await knowledgeRetrievalService.initialize();
}
