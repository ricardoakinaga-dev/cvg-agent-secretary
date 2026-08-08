const mocks = vi.hoisted(() => ({
  conversation: {
    findById: vi.fn(),
    listMessages: vi.fn(),
    getControlState: vi.fn(),
    setControlState: vi.fn(),
  },
  handoff: {
    findByConversation: vi.fn(),
    updateStatus: vi.fn(),
  },
  executeHandoff: vi.fn(),
  getLabelsForIntent: vi.fn(() => []),
  saveConversationContext: vi.fn(),
  trackEvent: vi.fn(),
  recordEvent: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/modules/conversations/repository', () => ({
  conversationRepository: mocks.conversation,
}));
vi.mock('../../src/modules/handoff/repository', () => ({
  handoffRepository: mocks.handoff,
}));
vi.mock('../../src/modules/chatwoot/integration', () => ({
  executeHandoff: mocks.executeHandoff,
  getLabelsForIntent: mocks.getLabelsForIntent,
}));
vi.mock('../../src/modules/conversations/contextLoader', () => ({
  formatConversationHistory: vi.fn((messages: Array<{ content: string }>) => messages.map((message) => message.content)),
  saveConversationContext: mocks.saveConversationContext,
  updateConversationState: vi.fn(),
}));
vi.mock('../../src/modules/analytics', () => ({
  analyticsService: { trackEvent: mocks.trackEvent },
}));
vi.mock('../../src/modules/audit/service', () => ({
  auditService: { recordEvent: mocks.recordEvent },
}));
vi.mock('../../src/modules/ai/router', () => ({
  aiRouter: { getPrimaryProvider: vi.fn(() => 'openai') },
}));
vi.mock('../../src/modules/logging', () => ({
  logger: {
    child: vi.fn(() => mocks.logger),
    debug: mocks.logger.debug,
    info: mocks.logger.info,
    warn: mocks.logger.warn,
    error: mocks.logger.error,
  },
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { reconcilePendingHandoff } from '../../src/modules/runtime/operationalHandoff';
import type { ConversationContext } from '../../src/shared/types';

const conversationId = '11111111-1111-4111-8111-111111111111';
const handoffId = '22222222-2222-4222-8222-222222222222';

function context(): ConversationContext {
  return {
    conversationId,
    chatwootConversationId: 123,
    contactId: 'contact-1',
    chatwootContactId: 99,
    contactName: 'Cliente',
    messages: [],
    metadata: {
      startedAt: new Date('2026-08-08T00:00:00.000Z'),
      messageCount: 0,
      lastMessageAt: new Date('2026-08-08T00:00:00.000Z'),
      inboxId: 1,
      accountId: 1,
    },
    state: 'handoff',
  };
}

function pendingHandoff() {
  return {
    id: handoffId,
    conversationId,
    contactId: null,
    triggerType: 'agent_response',
    triggerReason: 'Requer atendimento humano',
    status: 'pending' as const,
    priority: 'medium' as const,
    summary: 'Resumo',
    pendingQuestions: [],
    whatWasAnswered: 'Resposta',
    whatIsMissing: null,
    riskLevel: 'medium' as const,
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    completedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
    idempotencyKey: 'cvg:handoff:conversation:10',
  };
}

function control(state: 'handoff_pending' | 'handoff_active' | 'automated' | 'completed', version = 7) {
  return {
    conversationId,
    state,
    handoffUntil: new Date('2026-08-08T00:10:00.000Z'),
    handoffExpiredAt: null,
    handoffReason: 'Requer atendimento humano',
    handoffOwner: null,
    version,
    updatedAt: new Date('2026-08-08T00:00:00.000Z'),
  };
}

describe('pending handoff reconciliation concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handoff.findByConversation.mockResolvedValue(pendingHandoff());
    mocks.conversation.findById.mockResolvedValue({
      id: conversationId,
      chatwootConversationId: 123,
      chatwootContactId: 99,
      contactName: 'Cliente',
    });
    mocks.conversation.listMessages.mockResolvedValue([]);
    mocks.conversation.getControlState.mockResolvedValue(control('handoff_pending'));
    mocks.conversation.setControlState.mockResolvedValue(control('handoff_active', 8));
    mocks.handoff.updateStatus.mockResolvedValue({ ...pendingHandoff(), status: 'in_progress' });
    mocks.executeHandoff.mockResolvedValue(undefined);
    mocks.saveConversationContext.mockResolvedValue(undefined);
  });

  it('fences the pending-to-active transition with the durable control version', async () => {
    await expect(reconcilePendingHandoff(context(), mocks.logger)).resolves.toBe(true);

    expect(mocks.executeHandoff).toHaveBeenCalledOnce();
    expect(mocks.conversation.setControlState).toHaveBeenCalledWith(
      conversationId,
      'handoff_active',
      expect.objectContaining({ expectedVersion: 7 })
    );
    expect(mocks.handoff.updateStatus).toHaveBeenCalledWith(handoffId, 'in_progress', 'system');
  });

  it('does not reapply external handoff effects after an operator already resolved it', async () => {
    mocks.conversation.getControlState.mockResolvedValue(control('automated', 8));

    await expect(reconcilePendingHandoff(context(), mocks.logger)).resolves.toBe(false);

    expect(mocks.executeHandoff).not.toHaveBeenCalled();
    expect(mocks.conversation.setControlState).not.toHaveBeenCalled();
    expect(mocks.handoff.updateStatus).not.toHaveBeenCalled();
  });

  it('repairs a durable status left pending after external effects already activated control', async () => {
    mocks.conversation.getControlState.mockResolvedValue(control('handoff_active', 8));

    await expect(reconcilePendingHandoff(context(), mocks.logger)).resolves.toBe(true);

    expect(mocks.executeHandoff).not.toHaveBeenCalled();
    expect(mocks.handoff.updateStatus).toHaveBeenCalledWith(handoffId, 'in_progress', 'system');
  });
});
