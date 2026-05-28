// Knowledge Chunking Service
// Phase 2: Real chunking in the knowledge pipeline

import { 
  CreateKnowledgeChunkInput, 
  KnowledgeDocument,
  KnowledgeCategory 
} from './types';
import { openaiClient } from '../openai/client';
import { logger } from '../logging';

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  generateEmbeddings?: boolean;
}

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  chunkSize: 500,
  chunkOverlap: 50,
  generateEmbeddings: true,
};

export async function chunkDocument(
  document: KnowledgeDocument,
  options: ChunkingOptions = {}
): Promise<CreateKnowledgeChunkInput[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const content = document.content;
  
  if (!content || content.trim().length === 0) {
    console.warn(`Document has no content to chunk: ${document.id}`);
    return [];
  }

  const chunks: CreateKnowledgeChunkInput[] = [];
  const words = content.split(/\s+/);
  let currentChunk: string[] = [];
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

  logger.info('Document chunked', {
    documentId: document.id,
    chunksCount: chunks.length,
  });

  return chunks;
}

function createChunkInput(
  document: KnowledgeDocument,
  content: string,
  chunkIndex: number
): CreateKnowledgeChunkInput {
  return {
    documentId: document.id,
    chunkIndex,
    content,
    title: document.title,
    category: document.category as KnowledgeCategory,
    tags: document.tags,
    version: document.version,
    source: document.source,
  };
}

export async function generateChunkEmbeddings(
  chunks: CreateKnowledgeChunkInput[]
): Promise<void> {
  for (const chunk of chunks) {
    try {
      const embedding = await openaiClient.generateEmbedding(chunk.content);
      chunk.embedding = embedding;
      chunk.tokenCount = Math.ceil(chunk.content.split(/\s+/).length * 1.3);
    } catch (error) {
      console.warn(`Failed to generate embedding for chunk ${chunk.chunkIndex}: ${(error as Error).message}`);
    }
  }
}
