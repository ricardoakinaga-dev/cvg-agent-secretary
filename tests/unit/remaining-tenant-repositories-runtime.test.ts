const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({ query: mockQuery }));
vi.mock('../../src/config', () => ({ config: { chatwoot: { accountId: '42' } } }));
vi.mock('../../src/modules/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SummaryRepository } from '../../src/modules/summaries/repository';
import { FollowupRepository } from '../../src/modules/handoff/followupRepository';
import { HandoffRepository } from '../../src/modules/handoff/repository';
import { telegramIngestionRepository } from '../../src/modules/telegram-ingestion/repository';

describe('remaining tenant repository queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('binds the configured account on representative reads and updates', async () => {
    await new SummaryRepository().findByConversation('conversation-1');
    await new FollowupRepository().findPending(10);
    await new HandoffRepository().findByConversation('conversation-1');
    await new HandoffRepository().getOperationalRules('policy');
    await new HandoffRepository().updateNotificationStatus('notification-1', 'sent');
    await telegramIngestionRepository.getById('ingestion-1');
    await telegramIngestionRepository.getActiveOperationalRules();

    expect(mockQuery).toHaveBeenCalledTimes(7);
    for (const [sql, params] of mockQuery.mock.calls as Array<[string, unknown[]]>) {
      expect(sql).toContain('tenant_id');
      expect(params).toContain('42');
    }
  });
});
