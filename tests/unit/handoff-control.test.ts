const mocks = vi.hoisted(() => ({
  conversation: {
    findById: vi.fn(),
    getControlState: vi.fn(),
    setControlState: vi.fn(),
  },
  handoff: {
    findByConversation: vi.fn(),
    updateStatus: vi.fn(),
  },
  redis: {
    getConversationState: vi.fn(),
    setConversationState: vi.fn(),
  },
  chatwoot: {
    removeLabels: vi.fn(),
  },
}));

vi.mock('../../src/modules/conversations/repository', () => ({
  conversationRepository: mocks.conversation,
}));
vi.mock('../../src/modules/handoff/repository', () => ({
  handoffRepository: mocks.handoff,
}));
vi.mock('../../src/shared/redis', () => ({
  redisClient: mocks.redis,
}));
vi.mock('../../src/modules/chatwoot/client', () => ({
  chatwootClient: mocks.chatwoot,
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { resolveHandoffControl } from '../../src/modules/handoff/controlService';

const conversationId = '11111111-1111-4111-8111-111111111111';

function handoff() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    conversationId,
    contactId: null,
    triggerType: 'agent_response',
    triggerReason: 'Atendimento humano solicitado',
    status: 'in_progress' as const,
    priority: 'medium' as const,
    summary: 'Revisar atendimento',
    pendingQuestions: [],
    whatWasAnswered: null,
    whatIsMissing: null,
    riskLevel: 'medium' as const,
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    completedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
  };
}

describe('handoff control service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversation.findById.mockResolvedValue({
      id: conversationId,
      chatwootConversationId: 123,
    });
    mocks.conversation.getControlState.mockResolvedValue({
      conversationId,
      state: 'handoff_active',
      handoffUntil: new Date('2026-08-08T00:10:00.000Z'),
      handoffReason: 'Atendimento humano solicitado',
      handoffOwner: null,
      handoffExpiredAt: null,
      version: 4,
      updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    });
    mocks.handoff.findByConversation.mockResolvedValue(handoff());
    mocks.handoff.updateStatus.mockResolvedValue({ ...handoff(), status: 'completed' });
    mocks.conversation.setControlState.mockResolvedValue({
      ...mocks.conversation.getControlState(),
      state: 'automated',
      version: 5,
    });
    mocks.redis.getConversationState.mockResolvedValue({
      conversationId,
      state: 'handoff',
      metadata: {
        startedAt: '2026-08-08T00:00:00.000Z',
        handoffStartedAt: '2026-08-08T00:00:00.000Z',
        handoffUntil: '2026-08-08T00:10:00.000Z',
        handoffReason: 'Atendimento humano solicitado',
      },
      messages: [],
    });
    mocks.chatwoot.removeLabels.mockResolvedValue(undefined);
  });

  it('resumes automation only after the authenticated operator resolves the handoff', async () => {
    const result = await resolveHandoffControl({
      conversationId,
      action: 'resume',
      reason: 'Cliente confirmou que pode continuar no bot',
      actorId: 'operator-1',
    });

    expect(result).toEqual(expect.objectContaining({
      action: 'resume',
      controlState: 'automated',
      handoffId: '22222222-2222-4222-8222-222222222222',
    }));
    expect(mocks.handoff.updateStatus).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      'completed',
      'operator-1',
      expect.any(String)
    );
    expect(mocks.conversation.setControlState).toHaveBeenCalledWith(
      conversationId,
      'automated',
      expect.objectContaining({ handoffUntil: null, handoffOwner: null })
    );
    expect(mocks.redis.setConversationState).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({ state: 'in_progress' })
    );
    expect(mocks.chatwoot.removeLabels).toHaveBeenCalledWith(123, ['handoff', 'pending']);
  });

  it('completes the handoff without reopening automation', async () => {
    mocks.conversation.setControlState.mockResolvedValue({
      ...mocks.conversation.getControlState(),
      state: 'completed',
      version: 5,
    });

    const result = await resolveHandoffControl({
      conversationId,
      action: 'complete',
      reason: 'Atendimento encerrado pelo operador',
      actorId: 'operator-1',
    });

    expect(result.controlState).toBe('completed');
    expect(mocks.conversation.setControlState).toHaveBeenCalledWith(
      conversationId,
      'completed',
      expect.objectContaining({ handoffOwner: 'operator-1' })
    );
    expect(mocks.redis.setConversationState).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({ state: 'completed' })
    );
  });

  it('fails closed when the durable control state is not a handoff', async () => {
    mocks.conversation.getControlState.mockResolvedValue({
      ...mocks.conversation.getControlState(),
      state: 'automated',
    });

    await expect(resolveHandoffControl({
      conversationId,
      action: 'resume',
      reason: 'Tentativa inválida',
      actorId: 'operator-1',
    })).rejects.toThrow('Conversation is not awaiting handoff resolution');

    expect(mocks.chatwoot.removeLabels).not.toHaveBeenCalled();
    expect(mocks.conversation.setControlState).not.toHaveBeenCalled();
  });
});
