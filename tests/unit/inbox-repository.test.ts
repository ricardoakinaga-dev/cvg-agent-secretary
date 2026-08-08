const mockQuery = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({
  query: mockQuery,
  getClient: mockGetClient,
}));

import {
  InboundReceiptRepository,
  getMessageId,
  minimizePayload,
} from '../../src/modules/webhook/inboxRepository';
import { ChatwootWebhookPayload } from '../../src/shared/types';

function payload(event: ChatwootWebhookPayload['event'] = 'message_created'): ChatwootWebhookPayload {
  return {
    event,
    id: 100,
    created_at: '2026-08-08T00:00:00.000Z',
    message: event.startsWith('message_') ? {
      id: 200,
      content: 'Mensagem',
      message_type: 'incoming',
      sender: { id: 7, name: 'Maria', type: 'contact' },
      attachments: [{
        id: 1,
        filename: 'documento.pdf',
        content_type: 'application/pdf',
        file_url: 'https://private.example/documento.pdf',
        external_url: 'https://private.example/external.pdf',
      }],
      private: false,
    } : undefined,
    conversation: {
      id: 42,
      uuid: 'conversation-42',
      account_id: 1,
      inbox_id: 2,
      status: 'open',
      assignee_id: null,
      contact: {
        id: 7,
        name: 'Maria',
        email: 'maria@example.com',
        phone_number: '+5511999998888',
      },
    },
  };
}

function receiptRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date('2026-08-08T00:00:00.000Z');
  return {
    id: 'receipt-1',
    tenant_id: '1',
    delivery_id: 'd'.repeat(64),
    event_type: 'message_created',
    chatwoot_conversation_id: 42,
    chatwoot_message_id: 200,
    source_created_at: new Date('2026-08-08T00:00:00.000Z'),
    correlation_id: 'correlation-1',
    payload: payload(),
    status: 'accepted',
    attempts: 0,
    available_at: now,
    processing_owner: null,
    processing_until: null,
    last_actor: null,
    last_error: null,
    created_at: now,
    updated_at: now,
    processed_at: null,
    ...overrides,
  };
}

describe('inbound receipt repository', () => {
  const client = { query: vi.fn(), release: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClient.mockResolvedValue(client);
  });

  it('minimizes PII and attachment URLs before the payload is persisted', () => {
    const minimized = minimizePayload(payload());
    const serialized = JSON.stringify(minimized);

    expect(serialized).not.toContain('maria@example.com');
    expect(serialized).not.toContain('+5511999998888');
    expect(serialized).not.toContain('private.example');
    expect(minimized.message?.attachments).toEqual([{
      id: 1,
      filename: 'documento.pdf',
      content_type: 'application/pdf',
    }]);
  });

  it('accepts a receipt transactionally and returns the stored identity', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [receiptRow()] })
      .mockResolvedValueOnce({});
    const repository = new InboundReceiptRepository();

    const result = await repository.accept({
      deliveryId: 'd'.repeat(64),
      payload: payload(),
      correlationId: 'correlation-1',
    });

    expect(result.duplicate).toBe(false);
    expect(result.receipt.chatwootMessageId).toBe(200);
    expect(result.receipt.lastActor).toBeNull();
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    const insertParameters = client.query.mock.calls[2][1] as unknown[];
    expect(String(insertParameters[6])).not.toContain('maria@example.com');
    expect(String(insertParameters[6])).not.toContain('private.example');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('treats a concurrent unique violation as a duplicate instead of failing the webhook', async () => {
    const existing = receiptRow({ status: 'queued' });
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))
      .mockResolvedValueOnce({});
    mockQuery.mockResolvedValueOnce({ rows: [existing] });
    const repository = new InboundReceiptRepository();

    const result = await repository.accept({
      deliveryId: 'd'.repeat(64),
      payload: payload(),
      correlationId: 'correlation-2',
    });

    expect(result).toEqual({ receipt: expect.objectContaining({ id: 'receipt-1' }), duplicate: true });
    expect(client.query).toHaveBeenNthCalledWith(4, 'ROLLBACK');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM inbound_receipts'), expect.any(Array));
  });

  it('does not confuse a conversation event id with a message identity', () => {
    expect(getMessageId(payload('conversation_created'))).toBeNull();
    expect(getMessageId(payload('message_created'))).toBe(200);
  });

  it('uses an owner lease so duplicate workers cannot claim an active receipt', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'receipt-1' }], rowCount: 1 });
    const repository = new InboundReceiptRepository();

    await expect(repository.markProcessing('receipt-1', 'worker-a', 30_000)).resolves.toBe(true);
    await expect(repository.renewProcessing('receipt-1', 'worker-a', 30_000)).resolves.toBe(true);

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('processing_owner = $3'),
      ['1', 'receipt-1', 'worker-a', 30_000]
    );
  });
});
