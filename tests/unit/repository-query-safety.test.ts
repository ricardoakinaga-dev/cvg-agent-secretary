const mockDb = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('../../src/shared/db', () => mockDb);

import { auditService } from '../../src/modules/audit/service';
import { analyticsRepository } from '../../src/modules/analytics/repository';
import { knowledgeRepository } from '../../src/modules/knowledge/repository';

describe('repository query safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('fails closed when a critical audit event cannot be persisted', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('audit storage unavailable'));

    await expect(auditService.recordEvent({
      eventType: 'knowledge_published',
      actor: 'manager-1',
      resourceType: 'knowledge_document',
      resourceId: 'document-1',
      action: 'publish',
    })).rejects.toThrow('audit storage unavailable');
  });

  it('parameterizes and clamps the audit event limit', async () => {
    await auditService.getEvents({ actor: 'manager-1', limit: 50_000 });

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringMatching(/tenant_id = \$1[\s\S]*actor = \$2[\s\S]*LIMIT \$3/),
      ['1', 'manager-1', 500]
    );
  });

  it('parameterizes and clamps the analytics event limit', async () => {
    await analyticsRepository.getEvents({ conversationId: 'conversation-1', limit: -10 });

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringMatching(/tenant_id = \$1[\s\S]*conversation_id = \$2[\s\S]*LIMIT \$3/),
      ['1', 'conversation-1', 1]
    );
  });

  it('parameterizes the knowledge search limit without a category', async () => {
    await knowledgeRepository.searchChunksFullText({ query: 'vacina', limit: 5000 });

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringMatching(/tenant_id = \$1[\s\S]*plainto_tsquery\('portuguese', \$2\)[\s\S]*LIMIT \$3/),
      ['1', 'vacina', 100]
    );
  });

  it('uses the correct parameter index for categorized knowledge search', async () => {
    await knowledgeRepository.searchChunksFullText({
      query: 'vacina',
      category: 'procedure',
      limit: 10,
    });

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringMatching(/kc\.category = \$3[\s\S]*LIMIT \$4/),
      ['1', 'vacina', 'procedure', 10]
    );
  });
});
