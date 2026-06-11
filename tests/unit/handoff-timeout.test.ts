import { describe, expect, it } from 'vitest';
import { isHandoffExpired } from '../../src/modules/conversations/contextLoader';
import { ConversationContext } from '../../src/shared/types';

function createContext(overrides: Partial<ConversationContext> = {}): ConversationContext {
  return {
    conversationId: 'chatwoot-1',
    chatwootConversationId: 1,
    contactId: '1',
    chatwootContactId: 1,
    contactName: 'Cliente',
    messages: [],
    metadata: {
      startedAt: new Date('2026-06-10T20:00:00.000Z'),
      messageCount: 0,
      lastMessageAt: new Date('2026-06-10T20:00:00.000Z'),
      inboxId: 1,
      accountId: 1,
    },
    state: 'handoff',
    ...overrides,
  };
}

describe('handoff timeout', () => {
  it('expires legacy handoff states without handoffUntil', () => {
    expect(isHandoffExpired(createContext())).toBe(true);
  });

  it('expires handoff after handoffUntil', () => {
    const context = createContext({
      metadata: {
        ...createContext().metadata,
        handoffUntil: '2026-06-10T20:10:00.000Z',
      },
    });

    expect(isHandoffExpired(context, new Date('2026-06-10T20:10:01.000Z'))).toBe(true);
  });

  it('keeps handoff active before handoffUntil', () => {
    const context = createContext({
      metadata: {
        ...createContext().metadata,
        handoffUntil: '2026-06-10T20:10:00.000Z',
      },
    });

    expect(isHandoffExpired(context, new Date('2026-06-10T20:09:59.000Z'))).toBe(false);
  });
});
