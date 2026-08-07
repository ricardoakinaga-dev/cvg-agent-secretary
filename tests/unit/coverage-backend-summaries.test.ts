const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db/index.js', () => ({ query: mockQuery }));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SummaryRepository } from '../../src/modules/summaries/repository';
import { mapRowToSummary, type SummaryRow } from '../../src/modules/summaries/types';

const createdAt = new Date('2026-03-04T05:06:07.000Z');

function summaryRow(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    id: 'summary-1', conversation_id: 'conv-1', summary_text: 'Summary',
    key_points: ['one'], extracted_facts: [{ species: 'cat' }], intent: 'scheduling',
    sentiment: 'neutral', needs_handoff: false, handoff_reason: null,
    generated_by: 'openai', model_version: 'model-1', created_at: createdAt,
    ...overrides,
  };
}

describe('summary mapping and repository coverage', () => {
  const repository = new SummaryRepository();
  beforeEach(() => vi.clearAllMocks());

  it('maps database rows and sanitizes non-array JSON columns', () => {
    expect(mapRowToSummary(summaryRow({
      key_points: null as unknown as string[],
      extracted_facts: {} as unknown as Record<string, unknown>[],
    }))).toEqual(expect.objectContaining({
      id: 'summary-1', conversationId: 'conv-1', keyPoints: [], extractedFacts: [],
      createdAt,
    }));
  });

  it('finds the latest tenant summary and returns null when absent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [summaryRow()] }).mockResolvedValueOnce({ rows: [] });

    await expect(repository.findByConversation('conv-1')).resolves.toEqual(
      expect.objectContaining({ id: 'summary-1', summaryText: 'Summary' }),
    );
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'conv-1']);
    await expect(repository.findByConversation('missing')).resolves.toBeNull();
  });

  it('creates a summary using secure tenant scope and explicit defaults', async () => {
    mockQuery.mockResolvedValue({ rows: [summaryRow({
      key_points: [], extracted_facts: [], intent: null, sentiment: null,
      generated_by: 'openai', model_version: null,
    })] });

    await expect(repository.create({ conversationId: 'conv-1', summaryText: 'Summary' }))
      .resolves.toEqual(expect.objectContaining({ id: 'summary-1' }));
    expect(mockQuery.mock.calls[0][1]).toEqual([
      '1', 'conv-1', 'Summary', '[]', '[]', null, null, false, null, 'openai', null,
    ]);
  });

  it('creates a summary with every optional field', async () => {
    mockQuery.mockResolvedValue({ rows: [summaryRow({ needs_handoff: true, handoff_reason: 'risk' })] });
    await repository.create({
      conversationId: 'conv-1', summaryText: 'Summary', keyPoints: ['one'],
      extractedFacts: [{ pet: 'Rex' }], intent: 'clinical', sentiment: 'negative',
      needsHandoff: true, handoffReason: 'risk', generatedBy: 'openrouter', modelVersion: 'm-2',
    });
    expect(mockQuery.mock.calls[0][1]).toEqual([
      '1', 'conv-1', 'Summary', '["one"]', '[{"pet":"Rex"}]', 'clinical',
      'negative', true, 'risk', 'openrouter', 'm-2',
    ]);
  });

  it('rejects an empty update without querying', async () => {
    await expect(repository.update('summary-1', {})).rejects.toThrow('No fields to update');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updates all supported fields with stable parameter ordering', async () => {
    mockQuery.mockResolvedValue({ rows: [summaryRow({ summary_text: 'Updated' })] });
    await repository.update('summary-1', {
      summaryText: 'Updated', keyPoints: ['point'], extractedFacts: [{ a: 1 }],
      intent: 'faq', sentiment: 'positive', needsHandoff: false, handoffReason: 'resolved',
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('summary_text = $2, key_points = $3, extracted_facts = $4');
    expect(sql).toContain('WHERE tenant_id = $1 AND id = $9');
    expect(params).toEqual([
      '1', 'Updated', '["point"]', '[{"a":1}]', 'faq', 'positive', false, 'resolved', 'summary-1',
    ]);
  });

  it('does not update array fields when omitted and rejects missing summary', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(repository.update('missing', { needsHandoff: false }))
      .rejects.toThrow('Summary not found');
    expect(mockQuery.mock.calls[0][0]).toContain('needs_handoff = $2');
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', false, 'missing']);
  });

  it('lists summaries for a contact using a tenant-safe join', async () => {
    mockQuery.mockResolvedValue({ rows: [summaryRow()] });
    await expect(repository.findByContact('contact-1', 4)).resolves.toHaveLength(1);
    expect(mockQuery.mock.calls[0][0]).toContain(
      'JOIN conversations c ON c.tenant_id = cs.tenant_id AND c.id = cs.conversation_id',
    );
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'contact-1', 4]);

    await repository.findByContact('contact-2');
    expect(mockQuery.mock.calls[1][1]).toEqual(['1', 'contact-2', 10]);
  });

  it.each([
    ['find', () => repository.findByConversation('conv')],
    ['create', () => repository.create({ conversationId: 'conv', summaryText: 'text' })],
    ['update', () => repository.update('id', { summaryText: 'text' })],
    ['contact list', () => repository.findByContact('contact')],
  ])('propagates database errors from %s', async (_name, invoke) => {
    mockQuery.mockRejectedValue(new Error('database unavailable'));
    await expect(invoke()).rejects.toThrow('database unavailable');
  });
});
