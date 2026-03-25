// Knowledge Retrieval Tests
// Phase 3: RAG and Institutional Knowledge

import { KnowledgeRetrievalService } from '../../src/modules/knowledge/retrieval';
import { KnowledgeSearchOptions, KnowledgeCategory } from '../../src/modules/knowledge/types';

// Mock the dependencies
jest.mock('../../src/modules/knowledge/repository', () => ({
  knowledgeRepository: {
    searchChunksFullText: jest.fn(),
    getPublishedDocuments: jest.fn(),
  },
}));

jest.mock('../../src/modules/openai/client', () => ({
  openaiClient: {
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  },
}));

jest.mock('../../src/modules/logging', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock('../../src/config', () => ({
  config: {
    openai: {
      apiKey: 'test-key',
    },
  },
}));

import { knowledgeRepository } from '../../src/modules/knowledge/repository';

describe('KnowledgeRetrievalService', () => {
  let retrievalService: KnowledgeRetrievalService;

  beforeEach(() => {
    jest.clearAllMocks();
    retrievalService = new KnowledgeRetrievalService();
  });

  describe('search', () => {
    it('should return empty array when no results found', async () => {
      // Arrange
      (knowledgeRepository.searchChunksFullText as jest.Mock).mockResolvedValue([]);

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
        {
          id: 'chunk-1',
          content: 'Our hospital works from 7am to 7pm',
          category: 'faq' as KnowledgeCategory,
          source: 'manual',
          version: 1,
        },
      ];
      (knowledgeRepository.searchChunksFullText as jest.Mock).mockResolvedValue(mockChunks);

      // Act
      const results = await retrievalService.search({
        query: 'horário de funcionamento',
        limit: 3,
      });

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Our hospital works from 7am to 7pm');
    });

    it('should filter by category when provided', async () => {
      // Arrange
      (knowledgeRepository.searchChunksFullText as jest.Mock).mockResolvedValue([]);

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
      (knowledgeRepository.searchChunksFullText as jest.Mock).mockResolvedValue([]);

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
        {
          id: 'chunk-low',
          content: 'Low relevance content',
          category: 'faq' as KnowledgeCategory,
          source: 'manual',
          version: 1,
        },
      ];
      (knowledgeRepository.searchChunksFullText as jest.Mock).mockResolvedValue(mockChunks);

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
      (knowledgeRepository.getPublishedDocuments as jest.Mock).mockResolvedValue([]);

      // Act
      const isHealthy = await retrievalService.healthCheck();

      // Assert
      expect(isHealthy).toBe(true);
    });

    it('should return false when database fails', async () => {
      // Arrange
      (knowledgeRepository.getPublishedDocuments as jest.Mock).mockRejectedValue(new Error('DB Error'));

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
