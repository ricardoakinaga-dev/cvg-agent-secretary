const mockQuery = vi.hoisted(() => vi.fn());
const mockAudit = vi.hoisted(() => ({
  recordEvent: vi.fn(),
}));
const mockCreateChunksForDocument = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({
  query: mockQuery,
}));
vi.mock('../../src/modules/audit/service', () => ({
  auditService: mockAudit,
}));
vi.mock('../../src/modules/knowledge/pipeline', () => ({
  createChunksForDocument: mockCreateChunksForDocument,
}));

import { knowledgeRepository } from '../../src/modules/knowledge/repository';

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-1',
    title: 'Vacinas',
    content: 'Conteudo sobre vacinas',
    category: 'faq',
    status: 'draft',
    version: 1,
    source: 'manual',
    source_id: null,
    effective_from: null,
    effective_to: null,
    created_by: 'author-1',
    approved_by: null,
    approved_at: null,
    tags: [],
    metadata: {},
    is_active: true,
    created_at: new Date('2026-05-27T00:00:00.000Z'),
    updated_at: new Date('2026-05-27T00:00:00.000Z'),
    ...overrides,
  };
}

function chunkRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'chunk-1',
    document_id: 'doc-1',
    chunk_index: 0,
    content: 'Conteudo sobre vacinas',
    embedding: [0.1, 0.2],
    token_count: 12,
    title: 'Vacinas',
    category: 'faq',
    tags: ['vacina'],
    version: 1,
    source: 'manual',
    is_active: true,
    created_at: new Date('2026-05-27T00:00:00.000Z'),
    updated_at: new Date('2026-05-27T00:00:00.000Z'),
    ...overrides,
  };
}

describe('knowledge repository review workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates draft documents with safe defaults', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row()] });

    const document = await knowledgeRepository.createDocument({
      title: 'Vacinas',
      content: 'Conteudo sobre vacinas',
      category: 'faq',
      createdBy: 'author-1',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO knowledge_documents'),
      [
        'Vacinas',
        'Conteudo sobre vacinas',
        'faq',
        'draft',
        1,
        'manual',
        null,
        JSON.stringify([]),
        JSON.stringify({}),
        'author-1',
        true,
      ]
    );
    expect(document.status).toBe('draft');
  });

  it('updates document fields and maps review metadata', async () => {
    const approvedAt = new Date('2026-05-27T01:00:00.000Z');
    mockQuery.mockResolvedValueOnce({
      rows: [
        row({
          title: 'Vacinas atualizadas',
          content: 'Novo conteudo',
          category: 'procedure',
          status: 'approved',
          tags: ['vacina', 'cao'],
          metadata: { reviewed: true },
          approved_by: 'manager-1',
          approved_at: approvedAt,
        }),
      ],
    });

    const document = await knowledgeRepository.updateDocument({
      id: 'doc-1',
      title: 'Vacinas atualizadas',
      content: 'Novo conteudo',
      category: 'procedure',
      status: 'approved',
      tags: ['vacina', 'cao'],
      metadata: { reviewed: true },
      approvedBy: 'manager-1',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE knowledge_documents'),
      [
        'Vacinas atualizadas',
        'Novo conteudo',
        'procedure',
        'approved',
        JSON.stringify(['vacina', 'cao']),
        JSON.stringify({ reviewed: true }),
        'manager-1',
        'doc-1',
      ]
    );
    expect(document.title).toBe('Vacinas atualizadas');
    expect(document.approvedAt).toBe(approvedAt);
  });

  it('rejects document updates without fields', async () => {
    await expect(knowledgeRepository.updateDocument({ id: 'doc-1' })).rejects.toThrow('No updates provided');

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns null when a document is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(knowledgeRepository.getDocument('missing')).resolves.toBeNull();
  });

  it('throws when an update does not find the target document', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      knowledgeRepository.updateDocument({ id: 'missing', title: 'Novo titulo' })
    ).rejects.toThrow('Document not found: missing');
  });

  it('lists documents by category, publication and admin filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [row({ category: 'faq' })] })
      .mockResolvedValueOnce({ rows: [row({ status: 'published' })] })
      .mockResolvedValueOnce({ rows: [row({ status: 'pending_review', category: 'service' })] });

    const byCategory = await knowledgeRepository.getDocumentsByCategory('faq');
    const published = await knowledgeRepository.getPublishedDocuments();
    const filtered = await knowledgeRepository.listDocuments({
      status: 'pending_review',
      category: 'service',
      limit: 10,
    });

    expect(byCategory).toHaveLength(1);
    expect(published[0].status).toBe('published');
    expect(filtered[0].category).toBe('service');
    expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT $3'), [
      'pending_review',
      'service',
      10,
    ]);
  });

  it('submits draft documents for review', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [row()] })
      .mockResolvedValueOnce({ rows: [row({ status: 'pending_review' })] });

    const document = await knowledgeRepository.submitForReview('doc-1');

    expect(document.status).toBe('pending_review');
    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE knowledge_documents'),
      ['pending_review', 'doc-1']
    );
  });

  it('rejects invalid review submission states and missing documents', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(knowledgeRepository.submitForReview('missing')).rejects.toThrow('Document not found: missing');

    mockQuery.mockResolvedValueOnce({ rows: [row({ status: 'published' })] });
    await expect(knowledgeRepository.submitForReview('doc-1')).rejects.toThrow(
      'Document cannot be submitted for review from status: published'
    );
  });

  it('approves only pending review documents and records audit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [row({ status: 'pending_review' })] })
      .mockResolvedValueOnce({ rows: [row({ status: 'approved', approved_by: 'manager-1' })] });

    const document = await knowledgeRepository.approveDocument('doc-1', 'manager-1');

    expect(document.status).toBe('approved');
    expect(document.approvedBy).toBe('manager-1');
    expect(mockAudit.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'knowledge_updated',
      actor: 'manager-1',
      action: 'approve',
      resourceId: 'doc-1',
    }));
  });

  it('rejects approval when document is missing or in wrong status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(knowledgeRepository.approveDocument('missing', 'manager-1')).rejects.toThrow(
      'Document not found: missing'
    );

    mockQuery.mockResolvedValueOnce({ rows: [row({ status: 'draft' })] });
    await expect(knowledgeRepository.approveDocument('doc-1', 'manager-1')).rejects.toThrow(
      'Document must be pending_review before approval: draft'
    );
  });

  it('rejects reviewed documents and stores rejection metadata', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [row({ status: 'pending_review' })] })
      .mockResolvedValueOnce({
        rows: [
          row({
            status: 'rejected',
            metadata: {
              rejectionReason: 'Preco desatualizado',
              rejectedBy: 'manager-1',
            },
          }),
        ],
      });

    const document = await knowledgeRepository.rejectDocument('doc-1', 'manager-1', 'Preco desatualizado');

    expect(document.status).toBe('rejected');
    expect(document.metadata.rejectionReason).toBe('Preco desatualizado');
    expect(mockAudit.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'knowledge_rejected',
      actor: 'manager-1',
      action: 'reject',
      resourceId: 'doc-1',
    }));
  });

  it('rejects rejection when document is missing or already published', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(knowledgeRepository.rejectDocument('missing', 'manager-1')).rejects.toThrow(
      'Document not found: missing'
    );

    mockQuery.mockResolvedValueOnce({ rows: [row({ status: 'published' })] });
    await expect(knowledgeRepository.rejectDocument('doc-1', 'manager-1')).rejects.toThrow(
      'Document cannot be rejected from status: published'
    );
  });

  it('does not publish documents before approval', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row({ status: 'pending_review' })] });

    await expect(knowledgeRepository.publishDocument('doc-1', 'manager-1'))
      .rejects
      .toThrow('Document must be approved before publication');

    expect(mockCreateChunksForDocument).not.toHaveBeenCalled();
  });

  it('does not publish missing documents', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(knowledgeRepository.publishDocument('missing', 'manager-1')).rejects.toThrow(
      'Document not found: missing'
    );
  });

  it('throws when publication update finds no document', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [row({ status: 'approved' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(knowledgeRepository.publishDocument('doc-1', 'manager-1')).rejects.toThrow(
      'Document not found: doc-1'
    );
  });

  it('publishes approved documents and creates chunks', async () => {
    const publishedRow = row({
      status: 'published',
      approved_by: 'manager-1',
      version: 2,
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [row({ status: 'approved' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [publishedRow] });
    mockCreateChunksForDocument.mockResolvedValue(undefined);

    const document = await knowledgeRepository.publishDocument('doc-1', 'manager-1');

    expect(document.status).toBe('published');
    expect(mockCreateChunksForDocument).toHaveBeenCalledWith(expect.objectContaining({
      id: 'doc-1',
      status: 'published',
    }));
    expect(mockAudit.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'knowledge_published',
      actor: 'manager-1',
      action: 'publish',
    }));
  });

  it('still publishes when chunk generation fails', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [row({ status: 'approved' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row({ status: 'published', version: 2 })] });
    mockCreateChunksForDocument.mockRejectedValue(new Error('embedding failed'));

    const document = await knowledgeRepository.publishDocument('doc-1', 'manager-1');

    expect(document.status).toBe('published');
    expect(mockAudit.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'knowledge_published',
    }));
  });

  it('creates chunks and batches multiple chunk creations', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [chunkRow()] })
      .mockResolvedValueOnce({ rows: [chunkRow({ id: 'chunk-2', chunk_index: 1, embedding: null })] });

    const chunks = await knowledgeRepository.createChunks([
      {
        documentId: 'doc-1',
        chunkIndex: 0,
        content: 'Conteudo sobre vacinas',
        embedding: [0.1, 0.2],
        tokenCount: 12,
        title: 'Vacinas',
        category: 'faq',
        tags: ['vacina'],
        version: 1,
        source: 'manual',
      },
      {
        documentId: 'doc-1',
        chunkIndex: 1,
        content: 'Segundo chunk',
        category: 'faq',
      },
    ]);

    expect(chunks).toHaveLength(2);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO knowledge_chunks'),
      [
        'doc-1',
        0,
        'Conteudo sobre vacinas',
        [0.1, 0.2],
        12,
        'Vacinas',
        'faq',
        JSON.stringify(['vacina']),
        1,
        'manual',
        true,
      ]
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO knowledge_chunks'),
      [
        'doc-1',
        1,
        'Segundo chunk',
        null,
        null,
        null,
        'faq',
        JSON.stringify([]),
        1,
        'manual',
        true,
      ]
    );
  });

  it('gets chunks and active chunks for retrieval pipelines', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [chunkRow({ id: 'chunk-1' })] })
      .mockResolvedValueOnce({ rows: [chunkRow({ id: 'chunk-2' })] });

    const byDocument = await knowledgeRepository.getChunksByDocument('doc-1');
    const allActive = await knowledgeRepository.getAllActiveChunks();

    expect(byDocument[0].id).toBe('chunk-1');
    expect(allActive[0].id).toBe('chunk-2');
  });

  it('searches chunks using PostgreSQL full-text with and without category', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [chunkRow({ id: 'chunk-1' })] })
      .mockResolvedValueOnce({ rows: [chunkRow({ id: 'chunk-2', category: 'service' })] });

    const general = await knowledgeRepository.searchChunksFullText({ query: 'vacina', limit: 3 });
    const categorized = await knowledgeRepository.searchChunksFullText({
      query: 'horario',
      category: 'service',
    });

    expect(general[0].id).toBe('chunk-1');
    expect(categorized[0].category).toBe('service');
    expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('LIMIT 3'), ['vacina']);
    expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('AND category = $2'), [
      'horario',
      'service',
    ]);
  });

  it('soft deletes chunks by document id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await knowledgeRepository.deleteChunksByDocument('doc-1');

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE knowledge_chunks'), ['doc-1']);
  });
});
