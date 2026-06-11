const mockRedis = vi.hoisted(() => ({
  getConversationState: vi.fn(),
  listConversationStates: vi.fn(),
  setConversationState: vi.fn(),
}));

const mockChatwoot = vi.hoisted(() => ({
  removeLabels: vi.fn(),
}));

vi.mock('../../src/shared/redis', () => ({
  redisClient: mockRedis,
}));

vi.mock('../../src/modules/chatwoot/client', () => ({
  chatwootClient: mockChatwoot,
}));

import { beforeEach, describe, expect, it } from 'vitest';
import {
  isHandoffExpired,
  resetExpiredHandoff,
  sweepExpiredHandoffs,
} from '../../src/modules/conversations/contextLoader';
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.setConversationState.mockResolvedValue(undefined);
    mockRedis.listConversationStates.mockResolvedValue([]);
    mockChatwoot.removeLabels.mockResolvedValue(undefined);
  });

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

  it('resumes automation and removes temporary Chatwoot labels after timeout', async () => {
    const context = createContext({
      metadata: {
        ...createContext().metadata,
        handoffStartedAt: '2026-06-10T20:00:00.000Z',
        handoffUntil: '2026-06-10T20:10:00.000Z',
        handoffReason: 'Teste',
      },
    });

    await expect(
      resetExpiredHandoff(context, new Date('2026-06-10T20:10:01.000Z'))
    ).resolves.toBe(true);

    expect(context.state).toBe('in_progress');
    expect(context.metadata.handoffStartedAt).toBeUndefined();
    expect(context.metadata.handoffUntil).toBeUndefined();
    expect(context.metadata.handoffReason).toBeUndefined();
    expect(mockRedis.setConversationState).toHaveBeenCalledWith(
      'chatwoot-1',
      expect.objectContaining({ state: 'in_progress' })
    );
    expect(mockChatwoot.removeLabels).toHaveBeenCalledWith(1, ['handoff', 'pending']);
  });

  it('sweeps expired handoff states from Redis even without a new message', async () => {
    mockRedis.listConversationStates.mockResolvedValue([
      {
        conversationId: 'chatwoot-1',
        state: {
          conversationId: 'chatwoot-1',
          chatwootConversationId: 1,
          contactId: '1',
          chatwootContactId: 1,
          contactName: 'Cliente',
          messages: [],
          metadata: {
            ...createContext().metadata,
            handoffStartedAt: '2026-06-10T20:00:00.000Z',
            handoffUntil: '2026-06-10T20:10:00.000Z',
            handoffReason: 'Teste',
          },
          state: 'handoff',
        },
      },
    ]);

    await expect(sweepExpiredHandoffs(new Date('2026-06-10T20:10:01.000Z'))).resolves.toBe(1);

    expect(mockChatwoot.removeLabels).toHaveBeenCalledWith(1, ['handoff', 'pending']);
    expect(mockRedis.setConversationState).toHaveBeenCalledWith(
      'chatwoot-1',
      expect.objectContaining({ state: 'in_progress' })
    );
  });
});
