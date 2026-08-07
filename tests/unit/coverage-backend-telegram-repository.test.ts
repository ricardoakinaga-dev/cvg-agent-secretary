const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({ query: mockQuery }));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { telegramIngestionRepository as repository } from '../../src/modules/telegram-ingestion/repository';

const now = new Date('2026-05-06T07:08:09.000Z');

function ingestionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ing-1', telegram_chat_id: null, telegram_message_id: null, source: 'telegram',
    raw_content: 'Useful hospital content', title: null, classified_type: 'instruction',
    classification_confidence: '0.75', destination: 'rag', target_table: null,
    status: 'pending', validation_errors: null, content_length: 23, language: 'pt-BR',
    tags: null, metadata: null, knowledge_document_id: null, processed_by: null,
    processed_at: null, approved_by: null, approved_at: null, rejection_reason: null,
    created_at: now, updated_at: now, ...overrides,
  };
}

function ruleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1', name: 'Rule', description: null, rule_type: 'policy',
    content: { value: true }, version: 1, source: 'telegram', source_id: null,
    status: 'draft', effective_from: null, effective_to: null, created_by: null,
    approved_by: null, approved_at: null, is_active: false, created_at: now,
    updated_at: now, ...overrides,
  };
}

describe('telegram ingestion repository coverage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates and safely maps ingestion defaults', async () => {
    mockQuery.mockResolvedValue({ rows: [ingestionRow()] });
    const result = await repository.create({ rawContent: 'Useful hospital content' });
    expect(mockQuery.mock.calls[0][1]).toEqual([
      '1', null, null, 'telegram', 'Useful hospital content', null,
      'pending', 23, '[]', '{}',
    ]);
    expect(result).toEqual(expect.objectContaining({
      id: 'ing-1', classificationConfidence: 0.75, validationErrors: [], tags: [], metadata: {},
    }));
  });

  it('creates ingestion with explicit source and Telegram identity', async () => {
    mockQuery.mockResolvedValue({ rows: [ingestionRow({ telegram_chat_id: 4, telegram_message_id: 9, source: 'api', title: 'T' })] });
    await repository.create({ telegramChatId: 4, telegramMessageId: 9, source: 'api', rawContent: 'abc', title: 'T' });
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 4, 9, 'api', 'abc', 'T', 'pending', 3, '[]', '{}']);
  });

  it('updates classification and rejects missing ingestion', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ingestionRow({ classified_type: 'faq', tags: ['faq'] })] })
      .mockResolvedValueOnce({ rows: [] });
    await repository.updateWithClassification('ing-1', 'faq', 0.95, 'Title', ['faq'], 'rag', 'knowledge_documents', 'pending');
    expect(mockQuery.mock.calls[0][1]).toEqual([
      '1', 'ing-1', 'faq', 0.95, 'Title', '["faq"]', 'rag', 'knowledge_documents', 'pending',
    ]);
    await expect(repository.updateWithClassification('missing', 'faq', 1, 'T', [], 'rag', 'knowledge_documents', 'pending'))
      .rejects.toThrow('Ingestion not found: missing');
  });

  it('builds status updates only for present optional values', async () => {
    mockQuery.mockResolvedValue({ rows: [ingestionRow({ status: 'processed' })] });
    await repository.updateStatus('ing-1', 'processed', 'operator', 'doc-1', ['warning']);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('processed_by = $4');
    expect(sql).toContain('knowledge_document_id = $5');
    expect(sql).toContain('validation_errors = $6');
    expect(params).toEqual(['1', 'ing-1', 'processed', 'operator', 'doc-1', '["warning"]']);
  });

  it('supports a minimal status update and rejects a missing ingestion', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ingestionRow()] }).mockResolvedValueOnce({ rows: [] });
    await repository.updateStatus('ing-1', 'pending');
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'ing-1', 'pending']);
    expect(mockQuery.mock.calls[0][0]).not.toContain('processed_by');
    await expect(repository.updateStatus('missing', 'failed')).rejects.toThrow('Ingestion not found: missing');
  });

  it('approves and rejects ingestion with tenant context and handles misses', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [ingestionRow({ status: 'approved', approved_by: 'admin' })] })
      .mockResolvedValueOnce({ rows: [ingestionRow({ status: 'rejected', rejection_reason: 'stale' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await repository.approve('ing-1', 'admin');
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'ing-1', 'admin']);
    await repository.reject('ing-1', 'reviewer', 'stale');
    expect(mockQuery.mock.calls[1][1]).toEqual(['1', 'ing-1', 'reviewer', 'stale']);
    await expect(repository.approve('missing', 'admin')).rejects.toThrow('Ingestion not found: missing');
    await expect(repository.reject('missing', 'admin', 'bad')).rejects.toThrow('Ingestion not found: missing');
  });

  it('gets ingestion by ID or null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ingestionRow()] }).mockResolvedValueOnce({ rows: [] });
    await expect(repository.getById('ing-1')).resolves.toEqual(expect.objectContaining({ id: 'ing-1' }));
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'ing-1']);
    await expect(repository.getById('missing')).resolves.toBeNull();
  });

  it('lists ingestions by status, source, approval, and recency', async () => {
    mockQuery.mockResolvedValue({ rows: [ingestionRow()] });
    await expect(repository.getByStatus('pending', 4)).resolves.toHaveLength(1);
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'pending', 4]);
    await repository.getBySource('manual', 5);
    expect(mockQuery.mock.calls[1][1]).toEqual(['1', 'manual', 5]);
    await repository.getPendingApproval(6);
    expect(mockQuery.mock.calls[2][1]).toEqual(['1', 6]);
    await repository.getRecent(7);
    expect(mockQuery.mock.calls[3][1]).toEqual(['1', 7]);
  });

  it('uses list defaults', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await repository.getByStatus('pending');
    await repository.getBySource('api');
    await repository.getPendingApproval();
    await repository.getRecent();
    expect(mockQuery.mock.calls.map(call => call[1])).toEqual([
      ['1', 'pending', 100], ['1', 'api', 100], ['1', 50], ['1', 50],
    ]);
  });

  it('creates and maps operational rule defaults', async () => {
    mockQuery.mockResolvedValue({ rows: [ruleRow()] });
    const result = await repository.createOperationalRule({
      name: 'Rule', ruleType: 'policy', content: { value: true },
    });
    expect(mockQuery.mock.calls[0][1]).toEqual([
      '1', 'Rule', null, 'policy', '{"value":true}', 'telegram', null, null, 'draft',
    ]);
    expect(result).toEqual(expect.objectContaining({
      id: 'rule-1', description: undefined, sourceId: undefined,
      effectiveFrom: undefined, isActive: false,
    }));
  });

  it('creates an operational rule with explicit provenance', async () => {
    mockQuery.mockResolvedValue({ rows: [ruleRow()] });
    await repository.createOperationalRule({
      name: 'Rule', description: 'D', ruleType: 'schedule', content: {},
      source: 'api', sourceId: 'source-1', createdBy: 'admin',
    });
    expect(mockQuery.mock.calls[0][1]).toEqual([
      '1', 'Rule', 'D', 'schedule', '{}', 'api', 'source-1', 'admin', 'draft',
    ]);
  });

  it('gets operational rule by ID or null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ruleRow()] }).mockResolvedValueOnce({ rows: [] });
    await expect(repository.getOperationalRuleById('rule-1')).resolves.toEqual(expect.objectContaining({ id: 'rule-1' }));
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'rule-1']);
    await expect(repository.getOperationalRuleById('missing')).resolves.toBeNull();
  });

  it('filters operational rules by type with either active mode', async () => {
    mockQuery.mockResolvedValue({ rows: [ruleRow()] });
    await repository.getOperationalRulesByType('policy');
    expect(mockQuery.mock.calls[0][0]).toContain('is_active = true');
    await repository.getOperationalRulesByType('policy', false);
    expect(mockQuery.mock.calls[1][0]).not.toContain('is_active = true');
    expect(mockQuery.mock.calls[1][1]).toEqual(['1', 'policy']);
  });

  it('lists all active operational rules', async () => {
    mockQuery.mockResolvedValue({ rows: [ruleRow({ status: 'active', is_active: true })] });
    await expect(repository.getActiveOperationalRules()).resolves.toHaveLength(1);
    expect(mockQuery.mock.calls[0][0]).toContain("is_active = true AND status = 'active'");
    expect(mockQuery.mock.calls[0][1]).toEqual(['1']);
  });

  it('activates and deactivates an operational rule and rejects misses', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [ruleRow({ status: 'active' })] })
      .mockResolvedValueOnce({ rows: [ruleRow({ status: 'deprecated', is_active: false })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.activateOperationalRule('rule-1')).resolves.toEqual(expect.objectContaining({ status: 'active' }));
    await expect(repository.deactivateOperationalRule('rule-1')).resolves.toEqual(expect.objectContaining({ status: 'deprecated' }));
    await expect(repository.activateOperationalRule('missing')).rejects.toThrow('Operational rule not found: missing');
    await expect(repository.deactivateOperationalRule('missing')).rejects.toThrow('Operational rule not found: missing');
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'rule-1']);
  });
});
