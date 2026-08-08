const mockRedis = vi.hoisted(() => ({
  getConversationState: vi.fn(),
  listConversationStates: vi.fn(),
  setConversationState: vi.fn(),
}));

const mockChatwoot = vi.hoisted(() => ({
  removeLabels: vi.fn(),
}));

const mockHandoffRepository = vi.hoisted(() => ({
  cancelPendingByConversation: vi.fn(),
}));

const mockConversationRepository = vi.hoisted(() => ({
  getControlState: vi.fn(),
  setControlState: vi.fn(),
}));

vi.mock('../../src/shared/redis', () => ({
  redisClient: mockRedis,
}));

vi.mock('../../src/modules/chatwoot/client', () => ({
  chatwootClient: mockChatwoot,
}));

vi.mock('../../src/modules/handoff/repository', () => ({
  handoffRepository: mockHandoffRepository,
}));

vi.mock('../../src/modules/conversations/repository', () => ({
  conversationRepository: mockConversationRepository,
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
    mockHandoffRepository.cancelPendingByConversation.mockResolvedValue(1);
    mockConversationRepository.getControlState.mockResolvedValue(undefined);
    mockConversationRepository.setControlState.mockResolvedValue({ version: 5 });
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

  it('keeps automation blocked after timeout until an operator resolves the handoff', async () => {
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

    expect(context.state).toBe('handoff');
    expect(context.metadata.handoffStartedAt).toBe('2026-06-10T20:00:00.000Z');
    expect(context.metadata.handoffUntil).toBeUndefined();
    expect(context.metadata.handoffExpiredAt).toBe('2026-06-10T20:10:01.000Z');
    expect(context.metadata.handoffReason).toContain('continua bloqueada');
    expect(mockRedis.setConversationState).toHaveBeenCalledWith(
      'chatwoot-1',
      expect.objectContaining({ state: 'handoff' })
    );
    expect(mockChatwoot.removeLabels).not.toHaveBeenCalled();
    expect(mockHandoffRepository.cancelPendingByConversation).toHaveBeenCalledWith(
      'chatwoot-1',
      'Handoff expirado; automacao continua bloqueada ate resolucao humana'
    );
    expect(mockConversationRepository.setControlState).toHaveBeenCalledWith(
      'chatwoot-1',
      'handoff_active',
      expect.objectContaining({
        handoffUntil: null,
        handoffExpiredAt: new Date('2026-06-10T20:10:01.000Z'),
      })
    );
  });

  it('keeps the Redis handoff state when persisting expiration fails', async () => {
    const context = createContext();
    mockHandoffRepository.cancelPendingByConversation.mockRejectedValue(
      new Error('database unavailable')
    );

    await expect(resetExpiredHandoff(context)).rejects.toThrow('database unavailable');

    expect(context.state).toBe('handoff');
    expect(mockRedis.setConversationState).not.toHaveBeenCalled();
    expect(mockChatwoot.removeLabels).not.toHaveBeenCalled();
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

    expect(mockChatwoot.removeLabels).not.toHaveBeenCalled();
    expect(mockRedis.setConversationState).toHaveBeenCalledWith(
      'chatwoot-1',
      expect.objectContaining({ state: 'handoff' })
    );
  });

  it('does not expire a stale Redis handoff after an operator already resumed it', async () => {
    mockConversationRepository.getControlState.mockResolvedValue({
      state: 'automated',
      version: 9,
    });
    const context = createContext({
      metadata: {
        ...createContext().metadata,
        handoffUntil: '2026-06-10T20:10:00.000Z',
      },
    });

    await expect(
      resetExpiredHandoff(context, new Date('2026-06-10T20:10:01.000Z'))
    ).resolves.toBe(false);

    expect(mockHandoffRepository.cancelPendingByConversation).not.toHaveBeenCalled();
    expect(mockConversationRepository.setControlState).not.toHaveBeenCalled();
    expect(mockRedis.setConversationState).not.toHaveBeenCalled();
  });
});
