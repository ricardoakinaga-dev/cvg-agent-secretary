import { config } from '../../src/config';
import { QdrantHybridStore } from '../../src/modules/knowledge/qdrant-store';

describe('active QdrantHybridStore contract', () => {
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
    Object.assign(config.qdrant, originalQdrant);
    vi.clearAllMocks();
  });

  it('sends the configured API key', async () => {
    const store = new QdrantHybridStore();

    await expect(store.healthCheck()).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://qdrant.local/collections/test_collection',
      expect.objectContaining({
        headers: expect.objectContaining({ 'api-key': 'qdrant-key' }),
      })
    );
  });

  it('applies tenant and category filters to searches', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { points: [] } }),
      text: async () => '',
    })) as unknown as typeof fetch;
    const store = new QdrantHybridStore();

    await store.search('horario de atendimento', Array.from({ length: 1536 }, () => 0.1), {
      limit: 3,
      minRelevance: 0.7,
      category: 'service',
    });

    const requestBody = JSON.parse(vi.mocked(global.fetch).mock.calls[0][1]?.body as string);
    expect(requestBody.filter).toEqual({
      must: [
        { key: 'tenant_id', match: { value: '1' } },
        { key: 'category', match: { value: 'service' } },
      ],
      must_not: [{
        key: 'tags',
        match: {
          any: expect.arrayContaining(['internal', 'restrito', 'confidencial']),
        },
      }],
    });
  });

  it('preserves remote scores for the retrieval policy to evaluate', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          points: [{
            id: 'chunk-low-score',
            score: 0.42,
            payload: {
              tenant_id: '1',
              chunk_id: 'chunk-low-score',
              document_id: 'document-1',
              text: 'Horario de atendimento',
              title: 'Horarios',
              category: 'service',
              source: 'manual',
            },
          }],
        },
      }),
      text: async () => '',
    })) as unknown as typeof fetch;
    const store = new QdrantHybridStore();

    const results = await store.search(
      'horario de atendimento',
      Array.from({ length: 1536 }, () => 0.1),
      { limit: 3, minRelevance: 0.7 }
    );

    expect(results[0].relevance).toBe(0.42);
  });
});
