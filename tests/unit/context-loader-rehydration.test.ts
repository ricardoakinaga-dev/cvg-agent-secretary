const mocks = vi.hoisted(() => ({
  redis: {
    getConversationState: vi.fn(),
    setConversationState: vi.fn(),
    appendMessageToConversation: vi.fn(),
  },
  conversation: {
    getControlState: vi.fn(),
    findById: vi.fn(),
    listMessages: vi.fn(),
  },
}));

vi.mock('../../src/shared/redis', () => ({ redisClient: mocks.redis }));
vi.mock('../../src/modules/conversations/repository', () => ({
  conversationRepository: mocks.conversation,
}));

import { beforeEach, describe, expect, it } from 'vitest';
import {
  addMessageToContext,
  loadConversationContext,
  MAX_CONTEXT_MESSAGES,
} from '../../src/modules/conversations/contextLoader';

const conversationId = '11111111-1111-4111-8111-111111111111';

describe('conversation context rehydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis.setConversationState.mockResolvedValue(undefined);
    mocks.redis.appendMessageToConversation.mockResolvedValue(undefined);
    mocks.conversation.getControlState.mockResolvedValue({
      conversationId,
      state: 'handoff_active',
      handoffUntil: null,
      handoffExpiredAt: new Date('2026-08-08T00:30:00.000Z'),
      handoffReason: 'Aguardando operador',
      handoffOwner: null,
      version: 2,
      updatedAt: new Date('2026-08-08T00:30:00.000Z'),
    });
    mocks.conversation.findById.mockResolvedValue({
      id: conversationId,
      contactIntake: {
        stage: 'ready',
        contactRole: 'tutor',
        contactReason: 'Consulta',
        unansweredAttempts: 0,
        updatedAt: '2026-08-08T00:29:00.000Z',
      },
    });
    mocks.conversation.listMessages.mockResolvedValue([
      {
        id: 'message-1',
        chatwootMessageId: 10,
        content: 'Conteúdo durável',
        messageType: 'incoming',
        senderType: 'user',
        senderName: 'Cliente',
        createdAt: new Date('2026-08-08T00:10:00.000Z'),
      },
      {
        id: 'message-2',
        chatwootMessageId: 11,
        content: 'Mensagem recuperada',
        messageType: 'incoming',
        senderType: 'user',
        senderName: 'Cliente',
        createdAt: new Date('2026-08-08T00:20:00.000Z'),
      },
    ]);
    mocks.redis.getConversationState.mockResolvedValue({
      conversationId,
      state: 'in_progress',
      messages: [{
        messageId: 'cached-10',
        chatwootMessageId: 10,
        content: 'Conteúdo antigo do cache',
        messageType: 'incoming',
        senderType: 'user',
        senderName: 'Cliente',
        timestamp: '2026-08-08T00:10:00.000Z',
        attachments: [],
      }],
      metadata: {
        startedAt: '2026-08-08T00:00:00.000Z',
        messageCount: 1,
        lastMessageAt: '2026-08-08T00:10:00.000Z',
        inboxId: 1,
        accountId: 1,
        controlVersion: 1,
      },
    });
  });

  it('merges durable messages, detects stale control versions, and reapplies handoff state', async () => {
    const context = await loadConversationContext(
      conversationId,
      123,
      '99',
      99,
      'Cliente',
      1,
      1
    );

    expect(context.messages.map((message) => message.chatwootMessageId)).toEqual([10, 11]);
    expect(context.messages[0]?.content).toBe('Conteúdo durável');
    expect(context.state).toBe('handoff');
    expect(context.metadata.controlVersion).toBe(2);
    expect(context.metadata.handoffExpiredAt).toBe('2026-08-08T00:30:00.000Z');
    expect(context.metadata.contactIntake).toEqual(expect.objectContaining({ stage: 'ready' }));
    expect(mocks.redis.setConversationState).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({
        state: 'handoff',
        messages: expect.arrayContaining([expect.objectContaining({ chatwootMessageId: 11 })]),
      })
    );
  });

  it('keeps the context bounded while preserving the newest messages and total count', async () => {
    const messages = Array.from({ length: MAX_CONTEXT_MESSAGES }, (_, index) => ({
      messageId: `message-${index + 1}`,
      chatwootMessageId: index + 1,
      conversationId,
      chatwootConversationId: 123,
      contactId: '99',
      chatwootContactId: 99,
      content: `Mensagem ${index + 1}`,
      messageType: 'incoming' as const,
      senderType: 'user' as const,
      senderName: 'Cliente',
      timestamp: new Date(Date.UTC(2026, 7, 8, 0, index, 0)),
      attachments: [],
    }));
    const context = {
      conversationId,
      chatwootConversationId: 123,
      contactId: '99',
      chatwootContactId: 99,
      contactName: 'Cliente',
      messages,
      metadata: {
        startedAt: messages[0].timestamp,
        messageCount: MAX_CONTEXT_MESSAGES,
        lastMessageAt: messages.at(-1)!.timestamp,
        inboxId: 1,
        accountId: 1,
      },
      state: 'in_progress' as const,
    };

    await addMessageToContext(context, {
      ...messages.at(-1)!,
      messageId: 'message-51',
      chatwootMessageId: 51,
      content: 'Mensagem 51',
      timestamp: new Date(Date.UTC(2026, 7, 8, 1, 0, 0)),
    });

    expect(context.messages).toHaveLength(MAX_CONTEXT_MESSAGES);
    expect(context.messages[0]?.chatwootMessageId).toBe(2);
    expect(context.messages.at(-1)?.chatwootMessageId).toBe(51);
    expect(context.metadata.messageCount).toBe(51);
    expect(context.metadata.lastMessageAt.toISOString()).toBe('2026-08-08T01:00:00.000Z');
  });

  it('does not append a duplicate Chatwoot message to the auxiliary Redis list', async () => {
    const message = {
      messageId: 'message-1',
      chatwootMessageId: 10,
      conversationId,
      chatwootConversationId: 123,
      contactId: '99',
      chatwootContactId: 99,
      content: 'Conteúdo durável',
      messageType: 'incoming' as const,
      senderType: 'user' as const,
      senderName: 'Cliente',
      timestamp: new Date('2026-08-08T00:10:00.000Z'),
      attachments: [],
    };
    const context = {
      conversationId,
      chatwootConversationId: 123,
      contactId: '99',
      chatwootContactId: 99,
      contactName: 'Cliente',
      messages: [message],
      metadata: {
        startedAt: message.timestamp,
        messageCount: 1,
        lastMessageAt: message.timestamp,
        inboxId: 1,
        accountId: 1,
      },
      state: 'in_progress' as const,
    };

    await addMessageToContext(context, message);

    expect(mocks.redis.appendMessageToConversation).not.toHaveBeenCalled();
    expect(context.messages).toHaveLength(1);
    expect(context.metadata.messageCount).toBe(1);
  });
});
