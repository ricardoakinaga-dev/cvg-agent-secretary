const mockRedis = vi.hoisted(() => ({
  markBotOutgoingContent: vi.fn(),
  markBotOutgoingMessageId: vi.fn(),
}));
const mockChatwoot = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  sendMessageWithIdempotency: vi.fn(),
  findMessageByIdempotencyKey: vi.fn(),
}));
const mockConversationRepository = vi.hoisted(() => ({
  saveMessage: vi.fn(),
}));
const mockResponseOutbox = vi.hoisted(() => ({
  createOrGet: vi.fn(),
  claimForSend: vi.fn(),
  markSent: vi.fn(),
  markReconciled: vi.fn(),
  markUnknown: vi.fn(),
  findUnknown: vi.fn(),
  claimUnknown: vi.fn(),
  recoverStaleSending: vi.fn(),
}));

vi.mock('../../src/shared/redis', () => ({ redisClient: mockRedis }));
vi.mock('../../src/modules/chatwoot/client', () => ({ chatwootClient: mockChatwoot }));
vi.mock('../../src/modules/conversations/repository', () => ({
  conversationRepository: mockConversationRepository,
}));
vi.mock('../../src/modules/runtime/responseOutboxRepository', () => ({
  responseOutboxRepository: mockResponseOutbox,
}));

import {
  reconcileUnknownResponseIntents,
  sendBotMessage,
} from '../../src/modules/runtime/messageDelivery';

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'response-1',
    tenantId: '1',
    conversationId: 'conversation-1',
    chatwootConversationId: 42,
    inboundChatwootMessageId: 100,
    idempotencyKey: 'cvg:1:42:100',
    content: 'Resposta segura',
    status: 'pending',
    lockOwner: null,
    lockUntil: null,
    attempts: 0,
    chatwootMessageId: null,
    lastError: null,
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    sentAt: null,
    ...overrides,
  };
}

describe('durable Chatwoot response delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.markBotOutgoingContent.mockResolvedValue(undefined);
    mockRedis.markBotOutgoingMessageId.mockResolvedValue(undefined);
    mockConversationRepository.saveMessage.mockResolvedValue({ id: 'message-1' });
    mockResponseOutbox.recoverStaleSending.mockResolvedValue(0);
  });

  it('commits the response intent before posting and marks the external id as sent', async () => {
    const pending = intent();
    const sending = intent({ status: 'sending', lockOwner: 'runtime:response-1', attempts: 1 });
    const sent = intent({ status: 'sent', chatwootMessageId: 501 });
    mockResponseOutbox.createOrGet.mockResolvedValue(pending);
    mockResponseOutbox.claimForSend.mockResolvedValue(sending);
    mockChatwoot.sendMessageWithIdempotency.mockResolvedValue({ id: 501 });
    mockResponseOutbox.markSent.mockResolvedValue(sent);

    await sendBotMessage(42, 'conversation-1', 'Resposta segura', 100, 'correlation-1');

    expect(mockResponseOutbox.createOrGet).toHaveBeenCalledBefore(mockResponseOutbox.claimForSend);
    expect(mockResponseOutbox.createOrGet).toHaveBeenCalledWith(expect.objectContaining({
      correlationId: 'correlation-1',
    }));
    expect(mockResponseOutbox.claimForSend).toHaveBeenCalledWith('response-1', 'runtime:response-1', 30_000);
    expect(mockChatwoot.sendMessageWithIdempotency).toHaveBeenCalledWith({
      conversationId: 42,
      content: 'Resposta segura',
      idempotencyKey: 'cvg:1:42:100',
    });
    expect(mockResponseOutbox.markSent).toHaveBeenCalledWith('response-1', 501, 'runtime:response-1');
    expect(mockConversationRepository.saveMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-1',
      chatwootMessageId: 501,
      senderType: 'bot',
    }));
  });

  it('never sends a second POST for an unknown response without reconciliation', async () => {
    const unknown = intent({ status: 'unknown', lastError: 'timeout' });
    mockResponseOutbox.createOrGet.mockResolvedValue(unknown);
    mockChatwoot.findMessageByIdempotencyKey.mockResolvedValue(null);

    await expect(sendBotMessage(42, 'conversation-1', 'Resposta segura', 100))
      .rejects.toThrow('requires reconciliation');

    expect(mockChatwoot.sendMessageWithIdempotency).not.toHaveBeenCalled();
    expect(mockChatwoot.findMessageByIdempotencyKey).toHaveBeenCalledWith(
      42,
      'cvg:1:42:100',
      'Resposta segura',
      unknown.createdAt
    );
  });

  it('does not reclaim an active or stale sending intent into a new POST', async () => {
    mockResponseOutbox.createOrGet.mockResolvedValue(intent({ status: 'sending' }));
    mockResponseOutbox.claimForSend.mockResolvedValue(null);

    await expect(sendBotMessage(42, 'conversation-1', 'Resposta segura', 100))
      .rejects.toThrow('already being delivered');

    expect(mockChatwoot.sendMessageWithIdempotency).not.toHaveBeenCalled();
  });

  it('reconciles a crash after Chatwoot accepted the response without posting again', async () => {
    const sending = intent({ status: 'sending', lockOwner: 'runtime:response-1', attempts: 1 });
    const unknown = intent({ status: 'unknown', lastError: 'local persistence interrupted' });
    const reconciled = intent({ status: 'reconciled', chatwootMessageId: 503 });
    mockResponseOutbox.createOrGet
      .mockResolvedValueOnce(intent())
      .mockResolvedValueOnce(unknown);
    mockResponseOutbox.claimForSend.mockResolvedValue(sending);
    mockChatwoot.sendMessageWithIdempotency.mockResolvedValue({ id: 503 });
    mockResponseOutbox.markSent.mockRejectedValueOnce(new Error('simulated process crash'));
    mockResponseOutbox.markUnknown.mockResolvedValue(undefined);
    mockChatwoot.findMessageByIdempotencyKey.mockResolvedValue({ id: 503 });
    mockResponseOutbox.markReconciled.mockResolvedValue(reconciled);

    await expect(sendBotMessage(42, 'conversation-1', 'Resposta segura', 100))
      .rejects.toThrow('simulated process crash');
    await expect(sendBotMessage(42, 'conversation-1', 'Resposta segura', 100)).resolves.toBeUndefined();

    expect(mockChatwoot.sendMessageWithIdempotency).toHaveBeenCalledTimes(1);
    expect(mockResponseOutbox.markReconciled).toHaveBeenCalledWith(
      'response-1',
      503,
      'runtime:response-1'
    );
  });

  it('reconciles an unknown intent and persists the external message identity', async () => {
    const unknown = intent({ status: 'unknown' });
    const claimed = intent({ status: 'sending', lockOwner: 'reconciler:owner' });
    const reconciled = intent({ status: 'reconciled', chatwootMessageId: 502 });
    mockResponseOutbox.findUnknown.mockResolvedValue([unknown]);
    mockResponseOutbox.claimUnknown.mockResolvedValue(claimed);
    mockChatwoot.findMessageByIdempotencyKey.mockResolvedValue({ id: 502 });
    mockResponseOutbox.markReconciled.mockResolvedValue(reconciled);

    await expect(reconcileUnknownResponseIntents()).resolves.toBe(1);

    expect(mockResponseOutbox.markReconciled).toHaveBeenCalledWith(
      'response-1',
      502,
      expect.stringMatching(/^reconciler:/)
    );
    expect(mockConversationRepository.saveMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-1',
      chatwootMessageId: 502,
    }));
    expect(mockRedis.markBotOutgoingMessageId).toHaveBeenCalledWith(502);
  });
});
