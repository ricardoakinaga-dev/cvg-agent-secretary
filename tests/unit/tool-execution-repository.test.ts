const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({ query: mockQuery }));

import { ToolExecutionRepository } from '../../src/modules/agent-tools/executionRepository';

describe('tool execution repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims a mutating tool once with a durable idempotency key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'tool-1', status: 'pending' }] });
    const repository = new ToolExecutionRepository();

    await expect(repository.claim({
      conversationId: 'conversation-1',
      contactId: 'contact-1',
      toolName: 'confirm_appointment',
      toolInput: { appointmentId: 'appointment-1' },
      idempotencyKey: 'tool:conversation-1:message-1:hash',
    })).resolves.toEqual({ state: 'claimed', id: 'tool-1' });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (tenant_id, idempotency_key) DO NOTHING'),
      [
        '1',
        'conversation-1',
        'contact-1',
        'confirm_appointment',
        JSON.stringify({ appointmentId: 'appointment-1' }),
        'tool:conversation-1:message-1:hash',
      ]
    );
  });

  it('returns the completed result instead of executing the external effect again', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'tool-1', status: 'success', tool_output: { success: true } }] });
    const repository = new ToolExecutionRepository();

    await expect(repository.claim({
      conversationId: 'conversation-1',
      toolName: 'confirm_appointment',
      toolInput: {},
      idempotencyKey: 'tool:conversation-1:message-1:hash',
    })).resolves.toEqual({ state: 'completed', id: 'tool-1', output: { success: true } });
  });

  it('fails closed while a previous tool claim is still pending', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'tool-1', status: 'pending', tool_output: null }] });
    const repository = new ToolExecutionRepository();

    await expect(repository.claim({
      conversationId: 'conversation-1',
      toolName: 'notify_sector',
      toolInput: {},
      idempotencyKey: 'tool:conversation-1:message-1:hash',
    })).resolves.toEqual({ state: 'pending', id: 'tool-1' });
  });

  it('allows only an explicit operator decision to reopen a failed claim', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'tool-1', status: 'retryable', tool_output: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'tool-1' }] });
    const repository = new ToolExecutionRepository();

    await expect(repository.claim({
      conversationId: 'conversation-1',
      toolName: 'notify_sector',
      toolInput: {},
      idempotencyKey: 'tool:conversation-1:message-1:hash',
    })).resolves.toEqual({ state: 'claimed', id: 'tool-1' });
    expect(mockQuery.mock.calls[2][0]).toContain("status = 'pending'");
  });

  it('records explicit confirmation or retry decisions for reconciliation', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tool-1', status: 'reconciled' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'tool-1', status: 'retryable' }] });
    const repository = new ToolExecutionRepository();

    await expect(repository.reconcile('tool-1', 'confirm', 'operator-1', 'Confirmado no sistema externo'))
      .resolves.toEqual(expect.objectContaining({ id: 'tool-1', status: 'reconciled' }));
    await expect(repository.reconcile('tool-1', 'retry', 'operator-1', 'Falha externa confirmada'))
      .resolves.toEqual(expect.objectContaining({ id: 'tool-1', status: 'retryable' }));
  });
});
