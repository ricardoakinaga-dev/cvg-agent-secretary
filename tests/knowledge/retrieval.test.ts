// Knowledge Retrieval Tests
// Phase 3: RAG and Institutional Knowledge

import { KnowledgeRetrievalService } from '../../src/modules/knowledge/retrieval';
import { KnowledgeSearchOptions, KnowledgeCategory, KnowledgeChunk } from '../../src/modules/knowledge/types';

// Mock the dependencies
vi.mock('../../src/modules/knowledge/repository', () => ({
  knowledgeRepository: {
    searchChunksFullText: vi.fn(),
    getPublishedDocuments: vi.fn(),
  },
}));

vi.mock('../../src/modules/openai/client', () => ({
  openaiClient: {
    generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  },
}));

vi.mock('../../src/modules/logging', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../src/config', () => ({
  config: {
    knowledge: {
      vectorStore: 'postgres',
    },
    qdrant: {
      url: 'http://qdrant:6333',
      collection: 'test',
      vectorName: 'dense',
      sparseVectorName: 'sparse',
      prefetchLimit: 50,
      scoreThreshold: 0,
      createCollection: false,
      readOnly: true,
    },
    openai: {
      apiKey: 'test-key',
    },
    chatwoot: {
      accountId: '1',
    },
  },
}));

import { knowledgeRepository } from '../../src/modules/knowledge/repository';

function createChunk(overrides: Partial<KnowledgeChunk>): KnowledgeChunk {
  return {
    id: 'chunk-1',
    documentId: 'document-1',
    chunkIndex: 0,
    content: 'Knowledge content',
    category: 'faq',
    tags: [],
    version: 1,
    source: 'manual',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('KnowledgeRetrievalService', () => {
  let retrievalService: KnowledgeRetrievalService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(knowledgeRepository.getPublishedDocuments).mockResolvedValue([]);
    retrievalService = new KnowledgeRetrievalService();
  });

  describe('search', () => {
    it('should return empty array when no results found', async () => {
      // Arrange
      vi.mocked(knowledgeRepository.searchChunksFullText).mockResolvedValue([]);

      // Act
      const results = await retrievalService.search({
        query: 'test query',
        limit: 5,
      });

      // Assert
      expect(results).toEqual([]);
    });

    it('should return results when knowledge is found', async () => {
      // Arrange
      const mockChunks = [
        createChunk({
          id: 'chunk-1',
          content: 'Our hospital works from 7am to 7pm',
          category: 'faq' as KnowledgeCategory,
        }),
      ];
      vi.mocked(knowledgeRepository.searchChunksFullText).mockResolvedValue(mockChunks);

      // Act
      const results = await retrievalService.search({
        query: 'horário de funcionamento',
        limit: 3,
      });

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Our hospital works from 7am to 7pm');
    });

    it('should exclude internal chunks from the public conversation runtime', async () => {
      vi.mocked(knowledgeRepository.searchChunksFullText).mockResolvedValue([
        createChunk({
          content: 'Escala interna da equipe',
          tags: ['restrito'],
        }),
      ]);

      const results = await retrievalService.search({
        query: 'escala da equipe',
        limit: 3,
      });

      expect(results).toEqual([]);
    });

    it('should filter by category when provided', async () => {
      // Arrange
      vi.mocked(knowledgeRepository.searchChunksFullText).mockResolvedValue([]);

      // Act
      await retrievalService.search({
        query: 'test',
        category: 'faq',
        limit: 5,
      });

      // Assert
      expect(knowledgeRepository.searchChunksFullText).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'faq',
        })
      );
    });

    it('should respect limit parameter', async () => {
      // Arrange
      vi.mocked(knowledgeRepository.searchChunksFullText).mockResolvedValue([]);

      // Act
      await retrievalService.search({
        query: 'test',
        limit: 2,
      });

      // Assert
      expect(knowledgeRepository.searchChunksFullText).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 2,
        })
      );
    });

    it('should apply minimum relevance filter', async () => {
      // Arrange
      const mockChunks = [
        createChunk({
          id: 'chunk-low',
          content: 'Low relevance content',
          category: 'faq' as KnowledgeCategory,
        }),
      ];
      vi.mocked(knowledgeRepository.searchChunksFullText).mockResolvedValue(mockChunks);

      // Act - with high minimum relevance
      const results = await retrievalService.search({
        query: 'test',
        minRelevance: 0.9, // Higher than default fallback relevance
        limit: 5,
      });

      // Assert - should filter out low relevance
      expect(results).toHaveLength(0);
    });
  });

  describe('healthCheck', () => {
    it('should return true when database is healthy', async () => {
      // Arrange
      vi.mocked(knowledgeRepository.getPublishedDocuments).mockResolvedValue([]);

      // Act
      const isHealthy = await retrievalService.healthCheck();

      // Assert
      expect(isHealthy).toBe(true);
    });

    it('should return false when database fails', async () => {
      // Arrange
      vi.mocked(knowledgeRepository.getPublishedDocuments).mockRejectedValue(new Error('DB Error'));

      // Act
      const isHealthy = await retrievalService.healthCheck();

      // Assert
      expect(isHealthy).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return initialization status', () => {
      // Act
      const status = retrievalService.getStatus();

      // Assert
      expect(status).toHaveProperty('useVectorStore');
      expect(status).toHaveProperty('isInitialized');
    });
  });
});

describe('Knowledge Search Options Validation', () => {
  it('should accept valid search options', () => {
    const options: KnowledgeSearchOptions = {
      query: 'test query',
      category: 'faq',
      limit: 5,
      minRelevance: 0.7,
    };

    expect(options.query).toBe('test query');
    expect(options.category).toBe('faq');
    expect(options.limit).toBe(5);
  });

  it('should accept optional parameters', () => {
    const options: KnowledgeSearchOptions = {
      query: 'test',
    };

    expect(options.query).toBe('test');
    expect(options.category).toBeUndefined();
    expect(options.limit).toBeUndefined();
  });
});
