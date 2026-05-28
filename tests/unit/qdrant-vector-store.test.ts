import { config } from '../../src/config';
import { QdrantVectorStore } from '../../src/modules/knowledge/qdrant';
import { KnowledgeChunk } from '../../src/modules/knowledge/types';

describe('QdrantVectorStore', () => {
  const originalFetch = global.fetch;
  const originalQdrant = { ...config.qdrant };

  beforeEach(() => {
    config.qdrant.url = 'http://qdrant.local';
    config.qdrant.apiKey = 'qdrant-key';
    config.qdrant.collection = 'test_collection';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: [] }),
      text: async () => '',
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    config.qdrant.url = originalQdrant.url;
    config.qdrant.apiKey = originalQdrant.apiKey;
    config.qdrant.collection = originalQdrant.collection;
    vi.clearAllMocks();
  });

  it('creates or updates the configured collection on initialize', async () => {
    const store = new QdrantVectorStore(1536);

    await store.initialize();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://qdrant.local/collections/test_collection',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          vectors: {
            size: 1536,
            distance: 'Cosine',
          },
        }),
      })
    );
  });

  it('upserts chunks with embeddings', async () => {
    const store = new QdrantVectorStore(1536);
    const chunk: KnowledgeChunk = {
      id: '2fca7463-a3b2-4f99-8e05-d36caa7fd3e6',
      documentId: 'document-1',
      chunkIndex: 0,
      content: 'Horario de atendimento',
      embedding: [0.1, 0.2],
      tokenCount: 3,
      title: 'Horarios',
      category: 'service',
      tags: ['horario'],
      version: 1,
      source: 'manual',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    await store.addChunks([chunk]);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://qdrant.local/collections/test_collection/points?wait=true',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('Horario de atendimento'),
      })
    );
  });

  it('does not call Qdrant when chunks do not have embeddings', async () => {
    const store = new QdrantVectorStore(1536);
    const chunk: KnowledgeChunk = {
      id: 'chunk-without-embedding',
      documentId: 'document-1',
      chunkIndex: 0,
      content: 'Sem embedding',
      tokenCount: 2,
      title: 'Sem embedding',
      category: 'faq',
      tags: [],
      version: 1,
      source: 'manual',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    await store.addChunks([chunk]);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('searches with vector, score threshold and category filter', async () => {
    const store = new QdrantVectorStore(1536);

    await store.search('horario', [0.1, 0.2], {
      limit: 3,
      minRelevance: 0.7,
      category: 'service',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://qdrant.local/collections/test_collection/points/search',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"score_threshold":0.7'),
      })
    );
  });

  it('maps Qdrant search results into knowledge retrieval results', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: [
          {
            id: 'chunk-1',
            score: 0.91,
            payload: {
              documentId: 'document-1',
              chunkIndex: 2,
              content: 'Atendemos de segunda a sexta',
              tokenCount: 6,
              title: 'Horario',
              category: 'service',
              tags: ['horario'],
              version: 3,
              source: 'manual',
              isActive: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
          },
          {
            id: 'chunk-without-payload',
            score: 0.8,
          },
        ],
      }),
      text: async () => '',
    })) as unknown as typeof fetch;
    const store = new QdrantVectorStore(1536);

    const results = await store.search('horario', [0.1, 0.2], {
      limit: 3,
      minRelevance: 0.7,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      relevance: 0.91,
      documentTitle: 'Horario',
      chunk: {
        id: 'chunk-1',
        documentId: 'document-1',
        chunkIndex: 2,
        content: 'Atendemos de segunda a sexta',
        category: 'service',
        tags: ['horario'],
        version: 3,
        source: 'manual',
        isActive: true,
      },
    });
    expect(results[0].chunk.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('deletes points by document id', async () => {
    const store = new QdrantVectorStore(1536);

    await store.deleteByDocument('document-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://qdrant.local/collections/test_collection/points/delete?wait=true',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          filter: {
            must: [
              {
                key: 'documentId',
                match: { value: 'document-1' },
              },
            ],
          },
        }),
      })
    );
  });

  it('reports healthy when collection lookup succeeds', async () => {
    const store = new QdrantVectorStore(1536);

    await expect(store.healthCheck()).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://qdrant.local/collections/test_collection',
      expect.objectContaining({ headers: expect.objectContaining({ 'api-key': 'qdrant-key' }) })
    );
  });

  it('reports unhealthy when collection lookup fails', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => 'unavailable',
    })) as unknown as typeof fetch;
    const store = new QdrantVectorStore(1536);

    await expect(store.healthCheck()).resolves.toBe(false);
  });

  it('throws a clear error when Qdrant URL is missing', async () => {
    config.qdrant.url = '';
    const store = new QdrantVectorStore(1536);

    await expect(store.initialize()).rejects.toThrow('QDRANT_URL is not configured');
  });

  it('throws a clear error when Qdrant API returns an error', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'invalid api key',
    })) as unknown as typeof fetch;
    const store = new QdrantVectorStore(1536);

    await expect(store.initialize()).rejects.toThrow('Qdrant API error: 401 - invalid api key');
  });
});
