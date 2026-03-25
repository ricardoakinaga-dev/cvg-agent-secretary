// Knowledge Tools Tests
// Phase 3: RAG and Institutional Knowledge

import { searchKnowledge, SearchKnowledgeInput } from '../../src/modules/knowledge/tools';

// Mock the retrieval service
jest.mock('../../src/modules/knowledge/retrieval', () => ({
  knowledgeRetrievalService: {
    search: jest.fn(),
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

import { knowledgeRetrievalService } from '../../src/modules/knowledge/retrieval';

describe('searchKnowledge Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty results when query is empty', async () => {
    // Arrange
    const input: SearchKnowledgeInput = { query: '' };

    // Act
    const result = await searchKnowledge(input);

    // Assert
    expect(result.results).toEqual([]);
    expect(result.found).toBe(false);
    expect(result.count).toBe(0);
  });

  it('should return results when knowledge is found', async () => {
    // Arrange
    const mockResults = [
      {
        id: 'chunk-1',
        content: 'Hospital hours are 7am to 7pm',
        source: 'manual',
        relevance: 0.9,
        category: 'faq',
      },
    ];
    (knowledgeRetrievalService.search as jest.Mock).mockResolvedValue(mockResults);

    const input: SearchKnowledgeInput = { query: 'horário', limit: 3 };

    // Act
    const result = await searchKnowledge(input);

    // Assert
    expect(result.found).toBe(true);
    expect(result.count).toBe(1);
    expect(result.results[0].content).toBe('Hospital hours are 7am to 7pm');
  });

  it('should return no results when nothing is found', async () => {
    // Arrange
    (knowledgeRetrievalService.search as jest.Mock).mockResolvedValue([]);

    const input: SearchKnowledgeInput = { query: 'nonexistent topic' };

    // Act
    const result = await searchKnowledge(input);

    // Assert
    expect(result.found).toBe(false);
    expect(result.count).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('should pass category filter to retrieval service', async () => {
    // Arrange
    (knowledgeRetrievalService.search as jest.Mock).mockResolvedValue([]);

    const input: SearchKnowledgeInput = { query: 'test', category: 'policy' };

    // Act
    await searchKnowledge(input);

    // Assert
    expect(knowledgeRetrievalService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'test',
        category: 'policy',
      })
    );
  });

  it('should use default limit when not provided', async () => {
    // Arrange
    (knowledgeRetrievalService.search as jest.Mock).mockResolvedValue([]);

    const input: SearchKnowledgeInput = { query: 'test' };

    // Act
    await searchKnowledge(input);

    // Assert
    expect(knowledgeRetrievalService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 5, // Default from tool
      })
    );
  });

  it('should handle errors gracefully', async () => {
    // Arrange
    (knowledgeRetrievalService.search as jest.Mock).mockRejectedValue(new Error('Search failed'));

    const input: SearchKnowledgeInput = { query: 'test' };

    // Act
    const result = await searchKnowledge(input);

    // Assert - should return empty results on error
    expect(result.results).toEqual([]);
    expect(result.found).toBe(false);
  });
});

describe('SearchKnowledgeInput', () => {
  it('should accept valid input', () => {
    const input: SearchKnowledgeInput = {
      query: 'horário de funcionamento',
      category: 'faq',
      limit: 3,
    };

    expect(input.query).toBe('horário de funcionamento');
    expect(input.category).toBe('faq');
    expect(input.limit).toBe(3);
  });

  it('should allow optional fields', () => {
    const input: SearchKnowledgeInput = {
      query: 'test',
    };

    expect(input.query).toBe('test');
    expect(input.category).toBeUndefined();
    expect(input.limit).toBeUndefined();
  });
});
