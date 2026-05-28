const mockRedis = vi.hoisted(() => ({
  checkMessageHash: vi.fn(),
  setMessageHash: vi.fn(),
}));

const mockAiRouter = vi.hoisted(() => ({
  generate: vi.fn(),
  getPrimaryProvider: vi.fn(() => 'openai'),
}));

const mockChatwoot = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

const mockAnalytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

const mockKnowledgeRetrieval = vi.hoisted(() => ({
  search: vi.fn(),
}));

const mockContextLoader = vi.hoisted(() => ({
  loadConversationContext: vi.fn(),
  addMessageToContext: vi.fn(),
  formatConversationHistory: vi.fn(() => []),
  shouldProcessConversation: vi.fn(() => true),
  loadContactAndMemories: vi.fn(),
}));

const mockSchedulingState = vi.hoisted(() => ({
  handleSchedulingStateMachine: vi.fn(),
  markSchedulingIntent: vi.fn(),
}));

vi.mock('../../src/shared/redis', () => ({
  redisClient: mockRedis,
}));
vi.mock('../../src/modules/ai/router', () => ({
  aiRouter: mockAiRouter,
}));
vi.mock('../../src/modules/chatwoot/client', () => ({
  chatwootClient: mockChatwoot,
}));
vi.mock('../../src/modules/knowledge/retrieval', () => ({
  knowledgeRetrievalService: mockKnowledgeRetrieval,
}));
vi.mock('../../src/modules/analytics/index', () => ({
  analyticsService: mockAnalytics,
}));
vi.mock('../../src/modules/audit/service', () => ({
  auditService: { recordEvent: vi.fn() },
}));
vi.mock('../../src/modules/handoff/repository', () => ({
  handoffRepository: { create: vi.fn() },
}));
vi.mock('../../src/modules/chatwoot/integration', () => ({
  executeHandoff: vi.fn(),
  getLabelsForIntent: vi.fn(() => []),
}));
vi.mock('../../src/modules/security/guardrails', () => ({
  checkGuardrails: vi.fn(() => ({ allowed: true })),
  checkResponseGuardrails: vi.fn(() => ({ allowed: true })),
  generateFallbackResponse: vi.fn(() => 'Vou chamar um atendente.'),
}));
vi.mock('../../src/modules/intent/classifier', () => ({
  classifyIntent: vi.fn(() => ({ intent: 'agendamento', entities: {} })),
}));
vi.mock('../../src/modules/scheduling/state', () => mockSchedulingState);
vi.mock('../../src/modules/conversations/contextLoader', () => mockContextLoader);

import { processWebhookEvent } from '../../src/modules/runtime/agentRuntime';
import { ChatwootWebhookPayload, ConversationContext } from '../../src/shared/types';

function createPayload(content: string): ChatwootWebhookPayload {
  return {
    id: 1,
    event: 'message_created',
    message: {
      id: 10,
      content,
      message_type: 'incoming',
      sender: { id: 1, name: 'Maria', type: 'contact' },
      attachments: [],
      private: false,
    },
    conversation: {
      id: 123,
      uuid: 'conversation-1',
      account_id: 1,
      inbox_id: 1,
      status: 'open',
      assignee_id: null,
      contact: {
        id: 99,
        name: 'Maria',
        email: 'maria@example.com',
        phone_number: '+5511999999999',
      },
    },
  };
}

function createConversationContext(): ConversationContext {
  return {
    conversationId: 'conversation-1',
    chatwootConversationId: 123,
    contactId: 'contact-1',
    chatwootContactId: 99,
    contactName: 'Maria',
    messages: [],
    metadata: {
      startedAt: new Date('2026-05-27T00:00:00.000Z'),
      messageCount: 0,
      lastMessageAt: new Date('2026-05-27T00:00:00.000Z'),
      inboxId: 1,
      accountId: 1,
    },
    state: 'in_progress',
  };
}

describe('agent runtime scheduling state machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.checkMessageHash.mockResolvedValue(false);
    mockRedis.setMessageHash.mockResolvedValue(undefined);
    mockContextLoader.loadConversationContext.mockResolvedValue(createConversationContext());
    mockContextLoader.addMessageToContext.mockImplementation(async (context) => context);
    mockContextLoader.loadContactAndMemories.mockResolvedValue({
      contactId: 'contact-1',
      contact: null,
      memories: [],
      pets: [],
    });
    mockSchedulingState.handleSchedulingStateMachine.mockResolvedValue({ handled: false });
    mockSchedulingState.markSchedulingIntent.mockResolvedValue({
      stage: 'collecting_details',
      lastIntent: 'agendamento',
      updatedAt: '2026-05-27T00:00:00.000Z',
    });
    mockKnowledgeRetrieval.search.mockResolvedValue([]);
    mockAiRouter.generate.mockResolvedValue({
      content: 'A consulta custa R$ 120 e posso verificar horarios para voce.',
      confidence: 0.92,
      action: { type: 'respond', content: 'ok' },
    });
  });

  it('confirms a pending appointment before calling AI', async () => {
    mockSchedulingState.handleSchedulingStateMachine.mockResolvedValue({
      handled: true,
      stage: 'confirmed',
      appointmentId: 'appointment-1',
      message: 'Horario confirmado com sucesso.',
    });

    await processWebhookEvent(createPayload('sim, pode confirmar'));

    expect(mockSchedulingState.handleSchedulingStateMachine).toHaveBeenCalledWith(
      'conversation-1',
      'sim, pode confirmar'
    );
    expect(mockChatwoot.sendMessage).toHaveBeenCalledWith({
      conversationId: 123,
      content: 'Horario confirmado com sucesso.',
    });
    expect(mockAiRouter.generate).not.toHaveBeenCalled();
    expect(mockSchedulingState.markSchedulingIntent).not.toHaveBeenCalled();
    expect(mockAnalytics.trackEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'response_sent',
      metadata: expect.objectContaining({
        action: 'scheduling_state_machine',
        stage: 'confirmed',
        appointmentId: 'appointment-1',
      }),
    }));
  });

  it('processes the normal Chatwoot to RAG to AI to Chatwoot path', async () => {
    mockKnowledgeRetrieval.search.mockResolvedValue([
      {
        id: 'chunk-1',
        content: 'Consultas clinicas sao realizadas de segunda a sabado.',
        source: 'manual',
        relevance: 0.91,
        category: 'faq',
        title: 'Consultas',
      },
    ]);

    await processWebhookEvent(createPayload('qual o horario de atendimento?'));

    expect(mockKnowledgeRetrieval.search).toHaveBeenCalledWith({
      query: 'qual o horario de atendimento?',
      limit: 3,
      minRelevance: 0.7,
    });
    expect(mockAiRouter.generate).toHaveBeenCalledWith({
      message: 'qual o horario de atendimento?',
      context: expect.objectContaining({
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        contactName: 'Maria',
        knowledge: [
          expect.objectContaining({
            id: 'chunk-1',
            content: 'Consultas clinicas sao realizadas de segunda a sabado.',
          }),
        ],
        schedulingState: expect.objectContaining({
          stage: 'collecting_details',
        }),
      }),
    });
    expect(mockChatwoot.sendMessage).toHaveBeenCalledWith({
      conversationId: 123,
      content: 'A consulta custa R$ 120 e posso verificar horarios para voce.',
    });
    expect(mockAnalytics.trackEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'response_sent',
      metadata: expect.objectContaining({
        confidence: 0.92,
        action: 'respond',
      }),
    }));
  });
});
