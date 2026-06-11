import { QdrantHybridStore } from '../../src/modules/knowledge/qdrant-store';

jest.mock('../../src/config', () => ({
    config: {
    qdrant: {
      url: 'http://qdrant:6333',
      collection: 'cvg_agent_secretary',
      vectorName: 'dense',
      sparseVectorName: 'sparse',
      prefetchLimit: 25,
      scoreThreshold: 0,
      createCollection: false,
      readOnly: true,
    },
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

describe('QdrantHybridStore', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    delete (global as { fetch?: typeof fetch }).fetch;
  });

  it('searches using dense and sparse prefetches with RRF fusion', async () => {
    const embedding = Array.from({ length: 1536 }, () => 0.1);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          points: [
            {
              id: 'point-1',
              score: 0.42,
              payload: {
                chunk_id: 'chunk-1',
                document_id: 'doc-1',
                text: 'Horario de atendimento externo',
                title: 'Atendimento',
                category: 'faq',
                version: 2,
                source: 'manual',
                tags: ['publico'],
              },
            },
          ],
        },
      }),
    });

    const store = new QdrantHybridStore();
    const results = await store.search('qual o horario?', embedding, {
      limit: 3,
      minRelevance: 0.7,
      category: 'faq',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://qdrant:6333/collections/cvg_agent_secretary/points/query',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      })
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.prefetch).toHaveLength(2);
    expect(body.prefetch[0].using).toBe('sparse');
    expect(body.prefetch[1].using).toBe('dense');
    expect(body.query).toEqual({ fusion: 'rrf' });
    expect(body.filter).toBeUndefined();
    expect(results[0].chunk.content).toBe('Horario de atendimento externo');
    expect(results[0].chunk.id).toBe('chunk-1');
    expect(results[0].relevance).toBe(0.7);
  });

  it('falls back to dense search when hybrid search fails', async () => {
    const embedding = Array.from({ length: 1536 }, () => 0.2);

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'hybrid failed',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [
            {
              id: 'point-2',
              score: 0.55,
              payload: {
                chunk_id: 'chunk-2',
                document_id: 'doc-2',
                text: 'Consulta clinico geral R$ 89,00',
                title: 'Tabela',
                category: 'faq',
                version: 1,
                source: 'imported',
              },
            },
          ],
        }),
      });

    const store = new QdrantHybridStore();
    const results = await store.search('valor consulta veterinaria', embedding, {
      limit: 2,
      minRelevance: 0.1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('http://qdrant:6333/collections/cvg_agent_secretary/points/query');
    expect(fetchMock.mock.calls[1][0]).toBe('http://qdrant:6333/collections/cvg_agent_secretary/points/search');

    const fallbackBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fallbackBody.vector.name).toBe('dense');
    expect(fallbackBody.vector.vector).toHaveLength(1536);
    expect(results[0].chunk.content).toBe('Consulta clinico geral R$ 89,00');
  });

  it('rejects invalid dense vector dimensions before calling Qdrant', async () => {
    const store = new QdrantHybridStore();

    await expect(store.search('valor consulta', [], {
      limit: 2,
      minRelevance: 0.1,
    })).rejects.toThrow('Invalid Qdrant dense vector dimension');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false when the configured collection is unavailable', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'missing' });

    const store = new QdrantHybridStore();
    await expect(store.healthCheck()).resolves.toBe(false);
  });
});
