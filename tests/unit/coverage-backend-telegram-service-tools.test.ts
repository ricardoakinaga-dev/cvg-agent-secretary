const mockIngestionRepository = vi.hoisted(() => ({
  create: vi.fn(), updateStatus: vi.fn(), updateWithClassification: vi.fn(),
  createOperationalRule: vi.fn(), getById: vi.fn(), approve: vi.fn(), reject: vi.fn(),
  getPendingApproval: vi.fn(), getRecent: vi.fn(), getOperationalRulesByType: vi.fn(),
  getActiveOperationalRules: vi.fn(),
}));
const mockKnowledgeRepository = vi.hoisted(() => ({
  createDocument: vi.fn(), publishDocument: vi.fn(),
}));
const mockAuditRecordEvent = vi.hoisted(() => vi.fn());
const mockAssertAuditPrincipal = vi.hoisted(() => vi.fn());

vi.mock('../../src/modules/telegram-ingestion/repository', () => ({
  telegramIngestionRepository: mockIngestionRepository,
}));
vi.mock('../../src/modules/knowledge/repository', () => ({
  knowledgeRepository: mockKnowledgeRepository,
}));
vi.mock('../../src/modules/audit/service', () => ({
  auditService: { recordEvent: mockAuditRecordEvent },
  assertAuditPrincipal: mockAssertAuditPrincipal,
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifierService } from '../../src/modules/telegram-ingestion/classifier';
import { telegramIngestionService as service } from '../../src/modules/telegram-ingestion/service';
import {
  approveContent,
  ingestTelegramContent,
  listPendingContent,
  previewClassification,
  rejectContent,
} from '../../src/modules/telegram-ingestion/tools';
import type {
  ClassificationResult,
  ContentDestination,
  IngestionResult,
  TelegramContentType,
  TelegramIngestion,
} from '../../src/modules/telegram-ingestion/types';
import type { AuditPrincipal } from '../../src/modules/audit/service';

const now = new Date('2026-06-07T08:09:10.000Z');
const adminPrincipal = {
  id: 'admin',
  role: 'admin',
  source: 'signed_identity',
} as AuditPrincipal;

function ingestion(overrides: Partial<TelegramIngestion> = {}): TelegramIngestion {
  return {
    id: 'ing-1', source: 'telegram', rawContent: 'content', classifiedType: 'instruction',
    classificationConfidence: 0.8, destination: 'rag', status: 'pending',
    validationErrors: [], contentLength: 7, language: 'pt-BR', tags: [], metadata: {},
    createdAt: now, updatedAt: now, ...overrides,
  };
}

function classification(type: TelegramContentType = 'faq'): ClassificationResult {
  return {
    type, confidence: 0.9, title: 'Hospital knowledge', tags: [type],
    extractedData: { structured: true },
  };
}

function arrangePipeline(type: TelegramContentType, destination: ContentDestination) {
  vi.spyOn(classifierService, 'validate').mockReturnValue({ isValid: true, errors: [], warnings: [] });
  vi.spyOn(classifierService, 'classify').mockReturnValue(classification(type));
  vi.spyOn(classifierService, 'getRouting').mockReturnValue({
    destination,
    targetTable: destination === 'postgres' ? 'operational_rules' : 'knowledge_documents',
    requiresApproval: true,
    initialStatus: 'pending',
  });
}

describe('telegram ingestion service coverage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockIngestionRepository.create.mockResolvedValue(ingestion());
    mockIngestionRepository.updateStatus.mockResolvedValue(ingestion());
    mockIngestionRepository.updateWithClassification.mockResolvedValue(ingestion());
    mockIngestionRepository.createOperationalRule.mockResolvedValue({ id: 'rule-1' });
    mockKnowledgeRepository.createDocument.mockResolvedValue({ id: 'doc-1' });
    mockKnowledgeRepository.publishDocument.mockResolvedValue(undefined);
    mockAuditRecordEvent.mockResolvedValue(undefined);
  });

  it('rejects invalid content while retaining validation errors', async () => {
    vi.spyOn(classifierService, 'validate').mockReturnValue({
      isValid: false, errors: ['too short', 'unsafe'], warnings: [],
    });

    await expect(service.receiveContent({ rawContent: 'bad' })).resolves.toEqual({
      success: false, ingestionId: 'ing-1', status: 'rejected',
      message: 'Validation failed: too short, unsafe',
    });
    expect(mockIngestionRepository.updateStatus).toHaveBeenCalledWith(
      'ing-1', 'rejected', 'system', undefined, ['too short', 'unsafe'],
    );
    expect(mockIngestionRepository.updateWithClassification).not.toHaveBeenCalled();
  });

  it('rejects commands before routing them into knowledge', async () => {
    arrangePipeline('command', 'rejected');
    await expect(service.receiveContent({ rawContent: '/delete everything' })).resolves.toEqual({
      success: false, ingestionId: 'ing-1', status: 'rejected',
      message: 'Content is a command, not knowledge',
    });
    expect(mockIngestionRepository.updateStatus).toHaveBeenCalledWith(
      'ing-1', 'rejected', 'system', undefined, ['Content is a command, not knowledge'],
    );
  });

  it('processes RAG content and records the knowledge document reference', async () => {
    arrangePipeline('faq', 'rag');
    const result = await service.receiveContent({ rawContent: 'P: useful question\nR: useful answer', source: 'manual' });

    expect(result).toEqual(expect.objectContaining({
      success: true, ingestionId: 'ing-1', status: 'pending', knowledgeDocumentId: 'doc-1',
    }));
    expect(mockIngestionRepository.updateWithClassification).toHaveBeenCalledWith(
      'ing-1', 'faq', 0.9, 'Hospital knowledge', ['faq'], 'rag', 'knowledge_documents', 'pending',
    );
    expect(mockKnowledgeRepository.createDocument).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Hospital knowledge', category: 'faq', source: 'manual', sourceId: 'ing-1',
      metadata: { structured: true }, createdBy: 'telegram-ingestion',
    }));
    expect(mockIngestionRepository.updateStatus).toHaveBeenCalledWith('ing-1', 'processed', 'system', 'doc-1');
  });

  it.each([
    ['policy', 'policy'], ['procedure', 'procedure'], ['rule', 'policy'],
    ['feedback', 'orientation'], ['schedule', 'service'],
    ['price', 'service'], ['instruction', 'orientation'],
  ] as const)('maps %s to the %s knowledge category', async (type, category) => {
    arrangePipeline(type, 'rag');
    await service.receiveContent({ rawContent: 'long enough content for test' });
    expect(mockKnowledgeRepository.createDocument).toHaveBeenCalledWith(expect.objectContaining({ category }));
  });

  it('processes Postgres content and returns an operational rule ID', async () => {
    arrangePipeline('rule', 'postgres');
    const result = await service.receiveContent({ rawContent: 'Rule content' });
    expect(result.operationalRuleId).toBe('rule-1');
    expect(mockIngestionRepository.createOperationalRule).toHaveBeenCalledWith({
      name: 'Hospital knowledge', ruleType: 'rule', content: { structured: true },
      source: 'telegram', sourceId: 'ing-1', createdBy: 'telegram-ingestion',
    });
    expect(mockKnowledgeRepository.createDocument).not.toHaveBeenCalled();
  });

  it('processes both destinations and uses raw content when extraction is absent', async () => {
    arrangePipeline('policy', 'both');
    vi.spyOn(classifierService, 'classify').mockReturnValue({
      type: 'policy', confidence: 0.8, title: 'Policy', tags: [],
    });
    const result = await service.receiveContent({ rawContent: 'raw policy' });
    expect(result).toEqual(expect.objectContaining({ knowledgeDocumentId: 'doc-1', operationalRuleId: 'rule-1' }));
    expect(mockIngestionRepository.createOperationalRule).toHaveBeenCalledWith(expect.objectContaining({
      content: { content: 'raw policy' },
    }));
  });

  it('continues safely when destination writes fail independently', async () => {
    arrangePipeline('policy', 'both');
    mockKnowledgeRepository.createDocument.mockRejectedValue(new Error('vector failure'));
    mockIngestionRepository.createOperationalRule.mockRejectedValue(new Error('db failure'));
    await expect(service.receiveContent({ rawContent: 'raw policy' })).resolves.toEqual(expect.objectContaining({
      success: true, knowledgeDocumentId: undefined, operationalRuleId: undefined,
    }));
  });

  it('does not write a rejected non-command destination', async () => {
    arrangePipeline('instruction', 'rejected');
    await expect(service.receiveContent({ rawContent: 'ignored' })).resolves.toEqual(expect.objectContaining({ success: true }));
    expect(mockKnowledgeRepository.createDocument).not.toHaveBeenCalled();
    expect(mockIngestionRepository.createOperationalRule).not.toHaveBeenCalled();
  });

  it('returns a deterministic failed result for Error and non-Error failures', async () => {
    mockIngestionRepository.create.mockRejectedValueOnce(new Error('database down')).mockRejectedValueOnce('offline');
    await expect(service.receiveContent({ rawContent: 'content' })).resolves.toEqual({
      success: false, ingestionId: '', status: 'failed', message: 'Error: database down',
    });
    await expect(service.receiveContent({ rawContent: 'content' })).resolves.toEqual({
      success: false, ingestionId: '', status: 'failed', message: 'Error: offline',
    });
  });

  it('returns not found while approving an absent ingestion', async () => {
    mockIngestionRepository.getById.mockResolvedValue(null);
    await expect(service.approveIngestion('missing', adminPrincipal)).resolves.toEqual({
      success: false, ingestionId: 'missing', status: 'failed', message: 'Ingestion not found',
    });
  });

  it('publishes a linked document, updates status, and audits approval', async () => {
    mockIngestionRepository.getById.mockResolvedValue(ingestion({ knowledgeDocumentId: 'doc-1' }));
    await expect(service.approveIngestion('ing-1', adminPrincipal)).resolves.toEqual({
      success: true, ingestionId: 'ing-1', status: 'published',
      message: 'Content approved and published', knowledgeDocumentId: 'doc-1',
    });
    expect(mockKnowledgeRepository.publishDocument).toHaveBeenCalledWith('doc-1', adminPrincipal);
    expect(mockIngestionRepository.updateStatus).toHaveBeenCalledWith('ing-1', 'published', 'admin', 'doc-1');
    expect(mockAuditRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ingestion_approved', actor: 'admin', resourceId: 'ing-1',
      actorRole: 'admin', actorSource: 'signed_identity',
    }));
  });

  it('approves ingestion without a knowledge document and catches approval errors', async () => {
    mockIngestionRepository.getById.mockResolvedValueOnce(ingestion()).mockRejectedValueOnce(new Error('read failed'));
    await expect(service.approveIngestion('ing-1', adminPrincipal)).resolves.toEqual(expect.objectContaining({ success: true }));
    expect(mockIngestionRepository.approve).toHaveBeenCalledWith('ing-1', 'admin');
    await expect(service.approveIngestion('ing-2', adminPrincipal)).resolves.toEqual({
      success: false, ingestionId: 'ing-2', status: 'failed', message: 'Error: read failed',
    });
  });

  it('rejects and audits ingestion and catches rejection errors', async () => {
    mockIngestionRepository.reject.mockResolvedValueOnce(ingestion()).mockRejectedValueOnce('offline');
    await expect(service.rejectIngestion('ing-1', adminPrincipal, 'obsolete')).resolves.toEqual({
      success: true, ingestionId: 'ing-1', status: 'rejected', message: 'Rejected: obsolete',
    });
    expect(mockAuditRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ingestion_rejected', actor: 'admin', actorRole: 'admin',
      actorSource: 'signed_identity', details: { status: 'rejected' },
    }));
    await expect(service.rejectIngestion('ing-2', adminPrincipal, 'bad')).resolves.toEqual({
      success: false, ingestionId: 'ing-2', status: 'failed', message: 'Error: offline',
    });
  });

  it('delegates reads, previews, validation, and operational-rule selection', async () => {
    mockIngestionRepository.getById.mockResolvedValue(ingestion());
    mockIngestionRepository.getPendingApproval.mockResolvedValue([ingestion()]);
    mockIngestionRepository.getRecent.mockResolvedValue([ingestion()]);
    mockIngestionRepository.getOperationalRulesByType.mockResolvedValue([{ id: 'r' }]);
    mockIngestionRepository.getActiveOperationalRules.mockResolvedValue([{ id: 'all' }]);

    await service.getIngestion('ing-1');
    await service.getPendingIngestions(3);
    await service.getRecentIngestions(4);
    expect(service.classifyContent('/command').type).toBe('command');
    expect(service.validateContent('short').isValid).toBe(false);
    await service.getOperationalRules('policy');
    await service.getOperationalRules();

    expect(mockIngestionRepository.getPendingApproval).toHaveBeenCalledWith(3);
    expect(mockIngestionRepository.getRecent).toHaveBeenCalledWith(4);
    expect(mockIngestionRepository.getOperationalRulesByType).toHaveBeenCalledWith('policy');
    expect(mockIngestionRepository.getActiveOperationalRules).toHaveBeenCalledOnce();
  });
});

describe('telegram ingestion tool coverage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const successfulResult: IngestionResult = {
    success: true, ingestionId: 'ing-1', status: 'pending', message: 'queued', knowledgeDocumentId: 'doc-1',
  };

  it.each([undefined, 'faq' as const])('ingests content with classification %s', async (provided) => {
    vi.spyOn(service, 'receiveContent').mockResolvedValue(successfulResult);
    vi.spyOn(service, 'classifyContent').mockReturnValue(classification('faq'));
    const result = await ingestTelegramContent({ content: 'useful content', classification: provided, title: 'Title' });
    expect(result).toEqual(expect.objectContaining({
      success: true, destination: 'pending_review', knowledgeDocumentId: 'doc-1',
      classification: expect.objectContaining({ type: 'faq' }),
    }));
    expect(service.receiveContent).toHaveBeenCalledWith({ rawContent: 'useful content', source: 'manual', title: 'Title' });
  });

  it('rejects blank input and safely handles dependency failures', async () => {
    await expect(ingestTelegramContent({ content: '   ' })).resolves.toEqual(expect.objectContaining({
      success: false, status: 'failed', message: 'Error: Content is required',
    }));
    vi.spyOn(service, 'receiveContent').mockRejectedValue(new Error('offline'));
    await expect(ingestTelegramContent({ content: 'valid' })).resolves.toEqual(expect.objectContaining({
      success: false, message: 'Error: offline',
    }));
  });

  it('omits pending-review destination for failed ingestion', async () => {
    vi.spyOn(service, 'receiveContent').mockResolvedValue({
      success: false, ingestionId: '', status: 'failed', message: 'failed',
    });
    vi.spyOn(service, 'classifyContent').mockReturnValue(classification());
    await expect(ingestTelegramContent({ content: 'valid' })).resolves.toEqual(expect.objectContaining({
      success: false, destination: undefined,
    }));
  });

  it('approves and rejects content while converting thrown errors to tool results', async () => {
    vi.spyOn(service, 'approveIngestion').mockResolvedValue(successfulResult);
    vi.spyOn(service, 'rejectIngestion').mockResolvedValue({
      success: true, ingestionId: 'ing-1', status: 'rejected', message: 'rejected',
    });
    await expect(approveContent('ing-1', adminPrincipal)).resolves.toEqual({
      success: true, message: 'queued', knowledgeDocumentId: 'doc-1',
    });
    await expect(rejectContent('ing-1', adminPrincipal, 'bad')).resolves.toEqual({ success: true, message: 'rejected' });

    vi.spyOn(service, 'approveIngestion').mockRejectedValue(new Error('approve failed'));
    vi.spyOn(service, 'rejectIngestion').mockRejectedValue(new Error('reject failed'));
    await expect(approveContent('ing-1', adminPrincipal)).resolves.toEqual({ success: false, message: 'Error: approve failed' });
    await expect(rejectContent('ing-1', adminPrincipal, 'bad')).resolves.toEqual({ success: false, message: 'Error: reject failed' });
  });

  it('previews classification and its routing decision', () => {
    vi.spyOn(service, 'classifyContent').mockReturnValue(classification('price'));
    vi.spyOn(classifierService, 'getRouting').mockReturnValue({
      destination: 'postgres', targetTable: 'prices', requiresApproval: true, initialStatus: 'pending',
    });
    expect(previewClassification('Price', 'Title')).toEqual({
      type: 'price', confidence: 0.9, title: 'Hospital knowledge', tags: ['price'],
      destination: 'postgres', requiresApproval: true,
    });
  });

  it('lists pending content with a title fallback and handles list failures', async () => {
    vi.spyOn(service, 'getPendingIngestions').mockResolvedValue([
      ingestion({ id: 'one', title: 'Named' }), ingestion({ id: 'two', title: undefined }),
    ]);
    await expect(listPendingContent(2)).resolves.toEqual({
      success: true, count: 2,
      ingestions: [
        { id: 'one', title: 'Named', type: 'instruction', source: 'telegram', createdAt: now.toISOString() },
        { id: 'two', title: 'Untitled', type: 'instruction', source: 'telegram', createdAt: now.toISOString() },
      ],
    });
    vi.spyOn(service, 'getPendingIngestions').mockRejectedValue(new Error('read failed'));
    await expect(listPendingContent()).resolves.toEqual({ success: false, count: 0, ingestions: [] });
  });
});
