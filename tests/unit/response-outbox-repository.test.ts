const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({ query: mockQuery }));

import { ResponseOutboxRepository } from '../../src/modules/runtime/responseOutboxRepository';

function responseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date('2026-08-08T00:00:00.000Z');
  return {
    id: 'response-1',
    tenant_id: '1',
    conversation_id: 'conversation-1',
    chatwoot_conversation_id: 42,
    inbound_chatwoot_message_id: 100,
    correlation_id: null,
    idempotency_key: 'cvg:1:42:100',
    content: 'Resposta',
    status: 'pending',
    lock_owner: null,
    lock_until: null,
    last_actor: null,
    attempts: 0,
    chatwoot_message_id: null,
    last_error: null,
    created_at: now,
    sent_at: null,
    ...overrides,
  };
}

describe('response outbox repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates one stable response intent for an inbound Chatwoot message', async () => {
    mockQuery.mockResolvedValue({ rows: [responseRow()] });
    const repository = new ResponseOutboxRepository();

    const intent = await repository.createOrGet({
      conversationId: 'conversation-1',
      chatwootConversationId: 42,
      inboundChatwootMessageId: 100,
      content: 'Resposta',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (tenant_id, conversation_id, inbound_chatwoot_message_id)'),
      ['1', 'conversation-1', 42, 100, null, 'cvg:1:42:100', 'Resposta', 'runtime']
    );
    expect(intent).toEqual(expect.objectContaining({
      id: 'response-1',
      idempotencyKey: 'cvg:1:42:100',
      status: 'pending',
    }));
  });

  it('claims only pending or failed intents and records the delivery owner', async () => {
    mockQuery.mockResolvedValue({ rows: [responseRow({
      status: 'sending',
      lock_owner: 'worker-1',
      attempts: 1,
      last_actor: 'worker-1',
    })] });
    const repository = new ResponseOutboxRepository();

    const intent = await repository.claimForSend('response-1', 'worker-1', 30_000);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('pending', 'failed')"),
      ['1', 'response-1', 'worker-1', 30_000]
    );
    expect(intent?.status).toBe('sending');
  });

  it('moves an expired sending lease to unknown instead of allowing a second POST', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'response-1' }], rowCount: 1 });
    const repository = new ResponseOutboxRepository();

    await expect(repository.recoverStaleSending()).resolves.toBe(1);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'unknown'"),
      ['1', 100]
    );
  });
});
