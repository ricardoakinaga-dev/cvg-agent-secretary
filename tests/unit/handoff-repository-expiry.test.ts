const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db/index.js', () => ({
  query: mockQuery,
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { HandoffRepository } from '../../src/modules/handoff/repository';

describe('HandoffRepository.cancelPendingByConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels every active handoff for the conversation as a final state', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2, rows: [] });
    const repository = new HandoffRepository();

    await expect(
      repository.cancelPendingByConversation(
        'chatwoot-134',
        'Handoff expirado; automacao retomada'
      )
    ).resolves.toBe(2);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("SET status = 'cancelled'");
    expect(sql).toContain('completed_at = NOW()');
    expect(sql).toContain("status IN ('pending', 'in_progress')");
    expect(params).toEqual([
      '1',
      'chatwoot-134',
      'system',
      'Handoff expirado; automacao retomada',
    ]);
  });
});
