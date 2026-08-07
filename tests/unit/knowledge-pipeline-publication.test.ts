const mockRepository = vi.hoisted(() => ({
  createChunks: vi.fn(),
}));
const mockChunkDocument = vi.hoisted(() => vi.fn());
const mockGenerateChunkEmbeddings = vi.hoisted(() => vi.fn());
const mockRetrieval = vi.hoisted(() => ({
  addChunks: vi.fn(),
}));

vi.mock('../../src/modules/knowledge/repository', () => ({
  knowledgeRepository: mockRepository,
}));
vi.mock('../../src/modules/knowledge/chunking', () => ({
  chunkDocument: mockChunkDocument,
  generateChunkEmbeddings: mockGenerateChunkEmbeddings,
}));
vi.mock('../../src/modules/knowledge/retrieval', () => ({
  knowledgeRetrievalService: mockRetrieval,
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  indexChunksInVectorStore,
  prepareChunksForDocument,
} from '../../src/modules/knowledge/pipeline';
import { KnowledgeDocument } from '../../src/modules/knowledge/types';

const document = {
  id: 'doc-1',
  title: 'Vacinas',
  content: 'Conteudo',
  category: 'faq',
  status: 'published',
  version: 2,
  source: 'manual',
  tags: [],
  metadata: {},
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies KnowledgeDocument;

describe('knowledge publication pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not mask chunking errors', async () => {
    mockChunkDocument.mockRejectedValue(new Error('invalid document'));

    await expect(prepareChunksForDocument(document)).rejects.toThrow('invalid document');

    expect(mockGenerateChunkEmbeddings).not.toHaveBeenCalled();
    expect(mockRepository.createChunks).not.toHaveBeenCalled();
  });

  it('warns without throwing when post-commit vector indexing fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const chunks = [{ id: 'chunk-1' }];
    mockRetrieval.addChunks.mockRejectedValue(new Error('qdrant unavailable'));

    await expect(indexChunksInVectorStore(chunks as never)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      'Failed to index chunks in vector store:',
      'qdrant unavailable'
    );
    warn.mockRestore();
  });
});
