const mocks = vi.hoisted(() => ({
  redis: {
    isBotOutgoingMessageId: vi.fn(),
    consumeBotOutgoingContent: vi.fn(),
  },
  outbox: {
    findByChatwootMessageId: vi.fn(),
    findByIdempotencyKey: vi.fn(),
    markReconciled: vi.fn(),
  },
  conversation: {
    findByChatwootConversationId: vi.fn(),
    upsertConversation: vi.fn(),
  },
  handoff: {
    create: vi.fn(),
  },
  context: {
    loadConversationContext: vi.fn(),
    updateConversationState: vi.fn(),
  },
}));

vi.mock('../../src/shared/redis', () => ({ redisClient: mocks.redis }));
vi.mock('../../src/modules/runtime/responseOutboxRepository', () => ({
  responseOutboxRepository: mocks.outbox,
}));
vi.mock('../../src/modules/conversations/repository', () => ({
  conversationRepository: mocks.conversation,
}));
vi.mock('../../src/modules/handoff/repository', () => ({
  handoffRepository: mocks.handoff,
}));
vi.mock('../../src/modules/conversations/contextLoader', () => ({
  loadConversationContext: mocks.context.loadConversationContext,
  updateConversationState: mocks.context.updateConversationState,
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../src/config';
import { handleOutgoingMessage } from '../../src/modules/runtime/humanTakeover';

const payload = {
  event: 'message_created' as const,
  id: 90,
  conversation: {
    id: 123,
    uuid: 'conversation-uuid',
    account_id: 1,
    inbox_id: 1,
    status: 'open' as const,
    assignee_id: 10,
    contact: { id: 99, name: 'Maria' },
  },
  message: {
    id: 456,
    content: 'Olá, sou atendente e posso ajudar?',
    message_type: 'outgoing' as const,
    sender: { id: 10, name: 'Operador', type: 'user' as const },
    private: false,
  },
};

describe('human takeover persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis.isBotOutgoingMessageId.mockResolvedValue(false);
    mocks.redis.consumeBotOutgoingContent.mockResolvedValue(false);
    mocks.outbox.findByChatwootMessageId.mockResolvedValue(null);
    mocks.outbox.findByIdempotencyKey.mockResolvedValue(null);
    mocks.conversation.findByChatwootConversationId.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
    mocks.handoff.create.mockResolvedValue({ id: 'handoff-1' });
    mocks.context.loadConversationContext.mockResolvedValue({
      conversationId: '11111111-1111-4111-8111-111111111111',
      state: 'in_progress',
      messages: [],
      metadata: {},
    });
    mocks.context.updateConversationState.mockResolvedValue(undefined);
  });

  it('creates a durable handoff before pausing automation for a human message', async () => {
    const consumed = await handleOutgoingMessage(payload, {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never);

    expect(consumed).toBe(true);
    expect(mocks.context.loadConversationContext).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      123,
      '99',
      99,
      'Maria',
      1,
      1
    );
    expect(mocks.handoff.create).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: 'cvg:human-takeover:11111111-1111-4111-8111-111111111111:456',
    }));
    expect(mocks.context.updateConversationState).toHaveBeenCalledWith(
      expect.any(Object),
      'handoff',
      { reason: 'outgoing_message' }
    );
  });

  it('recognizes a marked bot response after a process crash and does not pause for a human', async () => {
    mocks.outbox.findByIdempotencyKey.mockResolvedValue({
      id: 'response-1',
      status: 'unknown',
    });
    const markedPayload = {
      ...payload,
      message: {
        ...payload.message,
        content: 'Resposta automatica',
        content_attributes: { cvg_idempotency_key: 'cvg:1:123:10' },
      },
    };

    await expect(handleOutgoingMessage(markedPayload, {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never)).resolves.toBe(true);

    expect(mocks.outbox.markReconciled).toHaveBeenCalledWith(
      'response-1',
      456,
      'webhook:456'
    );
    expect(mocks.handoff.create).not.toHaveBeenCalled();
  });

  it('recognizes the idempotency marker in the flat Chatwoot webhook format', async () => {
    mocks.outbox.findByIdempotencyKey.mockResolvedValue({
      id: 'response-flat-1',
      status: 'unknown',
    });
    const flatPayload = {
      event: 'message_created' as const,
      id: 456,
      content: 'Resposta automatica',
      content_attributes: { cvg_idempotency_key: 'cvg:flat:123:10' },
      message_type: 'outgoing' as const,
      sender: { id: 10, name: 'Secretary', type: 'bot' as const },
      private: false,
      conversation: payload.conversation,
    };

    await expect(handleOutgoingMessage(flatPayload, {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never)).resolves.toBe(true);

    expect(mocks.outbox.markReconciled).toHaveBeenCalledWith(
      'response-flat-1',
      456,
      'webhook:456'
    );
    expect(mocks.handoff.create).not.toHaveBeenCalled();
  });

  it('does not use an equal-content Redis marker as bot identity in strict mode', async () => {
    const original = config.chatwoot.allowContentTakeoverFallback;
    config.chatwoot.allowContentTakeoverFallback = false;
    mocks.redis.consumeBotOutgoingContent.mockResolvedValue(true);

    try {
      await expect(handleOutgoingMessage(payload, {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never)).resolves.toBe(true);
      expect(mocks.redis.consumeBotOutgoingContent).not.toHaveBeenCalled();
      expect(mocks.handoff.create).toHaveBeenCalled();
    } finally {
      config.chatwoot.allowContentTakeoverFallback = original;
    }
  });
});
