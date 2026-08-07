import http from 'http';
import { AddressInfo } from 'net';
import { createHash, createHmac } from 'crypto';
import { ChatwootWebhookPayload, ConversationContext } from '../../src/shared/types';

const mockRedis = vi.hoisted(() => ({
  ping: vi.fn(async () => true),
  checkMessageHash: vi.fn(),
  setMessageHash: vi.fn(),
  setMessageHashIfAbsent: vi.fn(),
  setContentHashIfAbsent: vi.fn(),
  claimMessageHash: vi.fn(),
  releaseMessageHash: vi.fn(),
  claimContentHash: vi.fn(),
  releaseContentHash: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  markBotOutgoingContent: vi.fn(),
  markBotOutgoingMessageId: vi.fn(),
  isBotOutgoingMessageId: vi.fn(),
  consumeBotOutgoingContent: vi.fn(),
}));

const mockAiRouter = vi.hoisted(() => ({
  generate: vi.fn(),
  getPrimaryProvider: vi.fn(() => 'openai'),
}));

const mockChatwoot = vi.hoisted(() => ({
  healthCheck: vi.fn(async () => true),
  sendMessage: vi.fn(),
}));

const mockKnowledgeRetrieval = vi.hoisted(() => ({
  healthCheck: vi.fn(async () => true),
  search: vi.fn(),
}));

const mockAnalytics = vi.hoisted(() => ({
  getEventStats: vi.fn(async () => ({
    conversationsStarted: 0,
    conversationsEnded: 0,
    handoffs: 0,
    fallbacks: 0,
    errors: 0,
    avgResponseLatency: 0,
  })),
  trackEvent: vi.fn(),
}));

const mockContextLoader = vi.hoisted(() => ({
  loadConversationContext: vi.fn(),
  addMessageToContext: vi.fn(),
  formatConversationHistory: vi.fn(() => []),
  shouldProcessConversation: vi.fn(() => true),
  loadContactAndMemories: vi.fn(),
  saveConversationContext: vi.fn(),
  updateConversationState: vi.fn(),
  resetExpiredHandoff: vi.fn(),
}));

const mockSchedulingState = vi.hoisted(() => ({
  handleSchedulingStateMachine: vi.fn(),
  markSchedulingIntent: vi.fn(),
}));

const mockWebhookWorker = vi.hoisted(() => ({
  enqueue: vi.fn(),
}));

const mockConversationRepository = vi.hoisted(() => ({
  upsertConversation: vi.fn(),
  saveMessage: vi.fn(),
  updateContactIntake: vi.fn(),
}));

vi.mock('../../src/shared/redis', () => ({
  redisClient: mockRedis,
}));
vi.mock('../../src/shared/db', () => ({
  checkDatabaseConnection: vi.fn(async () => true),
  query: vi.fn(),
  getClient: vi.fn(),
}));
vi.mock('../../src/modules/openai/client', () => ({
  openaiClient: { healthCheck: vi.fn(async () => true) },
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
  checkCommercialResponseGuardrails: vi.fn(() => ({ allowed: true })),
  generateFallbackResponse: vi.fn(() => 'Vou chamar um atendente.'),
  sanitizeForPrompt: vi.fn((text: string) => text),
}));
vi.mock('../../src/modules/intent/classifier', () => ({
  classifyIntent: vi.fn(() => ({
    intent: 'agendamento',
    confidence: 0.8,
    priority: 'medium',
    detectedKeywords: ['agendamento'],
    entities: { petName: 'Buddy' },
    requiresHandoff: false,
    riskLevel: 'low',
  })),
  getRecommendedAction: vi.fn(() => ({
    shouldRespond: true,
    shouldUseKnowledge: true,
    responseTone: 'informative',
  })),
}));
vi.mock('../../src/modules/scheduling/state', () => mockSchedulingState);
vi.mock('../../src/modules/conversations/contextLoader', () => mockContextLoader);
vi.mock('../../src/modules/conversations/repository', () => ({
  conversationRepository: mockConversationRepository,
}));
vi.mock('../../src/modules/webhook/worker', () => ({
  chatwootWebhookWorker: mockWebhookWorker,
}));
vi.mock('../../src/modules/knowledge/adminRoutes', async () => {
  const express = await vi.importActual<typeof import('express')>('express');
  return { knowledgeAdminRouter: express.Router() };
});
vi.mock('../../src/modules/scheduling/adminRoutes', async () => {
  const express = await vi.importActual<typeof import('express')>('express');
  return { schedulingAdminRouter: express.Router() };
});

import { app } from '../../src/app';
import { processWebhookEvent } from '../../src/modules/runtime/agentRuntime';

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function signBody(body: string, timestamp: string): string {
  return `sha256=${createHmac('sha256', 'test-webhook-secret').update(`${timestamp}.${body}`).digest('hex')}`;
}

function createConversationContext(): ConversationContext {
  return {
    conversationId: 'conversation-123',
    chatwootConversationId: 123,
    contactId: 'contact-99',
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

function createSignedPayload(content: string): { body: string; signature: string; timestamp: string } {
  const payload: ChatwootWebhookPayload = {
    id: 1,
    event: 'message_created',
    message: {
      id: 10,
      content,
      message_type: 'incoming',
      sender: { id: 99, name: 'Maria', type: 'contact' },
      attachments: [],
      private: false,
    },
    conversation: {
      id: 123,
      uuid: 'conversation-123',
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
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return { body, signature: signBody(body, timestamp), timestamp };
}

describe('signed Chatwoot webhook to agent response flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.checkMessageHash.mockResolvedValue(false);
    mockRedis.setMessageHash.mockResolvedValue(undefined);
    mockRedis.setMessageHashIfAbsent.mockResolvedValue(true);
    mockRedis.setContentHashIfAbsent.mockResolvedValue(true);
    mockRedis.claimMessageHash.mockResolvedValue(true);
    mockRedis.releaseMessageHash.mockResolvedValue(true);
    mockRedis.claimContentHash.mockResolvedValue(true);
    mockRedis.releaseContentHash.mockResolvedValue(true);
    mockRedis.acquireLock.mockResolvedValue(true);
    mockRedis.releaseLock.mockResolvedValue(true);
    mockRedis.markBotOutgoingContent.mockResolvedValue(undefined);
    mockRedis.markBotOutgoingMessageId.mockResolvedValue(undefined);
    mockRedis.isBotOutgoingMessageId.mockResolvedValue(false);
    mockRedis.consumeBotOutgoingContent.mockResolvedValue(false);
    mockContextLoader.loadConversationContext.mockResolvedValue(createConversationContext());
    mockContextLoader.addMessageToContext.mockImplementation(async (context) => context);
    mockContextLoader.updateConversationState.mockResolvedValue(undefined);
    mockContextLoader.saveConversationContext.mockResolvedValue(undefined);
    mockContextLoader.resetExpiredHandoff.mockResolvedValue(undefined);
    mockContextLoader.loadContactAndMemories.mockResolvedValue({
      contactId: 'contact-99',
      contact: null,
      memories: [],
      pets: [{ id: 'pet-1', name: 'Buddy', species: 'dog' }],
    });
    mockSchedulingState.handleSchedulingStateMachine.mockResolvedValue({ handled: false });
    mockSchedulingState.markSchedulingIntent.mockResolvedValue({
      stage: 'collecting_details',
      petName: 'Buddy',
      lastIntent: 'agendamento',
      updatedAt: '2026-05-27T00:00:00.000Z',
    });
    mockKnowledgeRetrieval.search.mockResolvedValue([
      {
        id: 'chunk-1',
        content: 'Consultas podem ser agendadas de segunda a sabado.',
        source: 'manual',
        relevance: 0.93,
        category: 'faq',
        title: 'Agenda',
        documentVersion: 2,
      },
    ]);
    mockAiRouter.generate.mockResolvedValue({
      content: 'Posso verificar os horarios disponiveis para o Buddy.',
      confidence: 0.94,
      action: { type: 'respond', content: 'ok' },
    });
    mockChatwoot.sendMessage.mockResolvedValue({ id: 999 });
    mockConversationRepository.upsertConversation.mockResolvedValue({
      id: 'persisted-conversation-123',
    });
    mockConversationRepository.saveMessage.mockResolvedValue({ id: 'persisted-message-1' });
    mockConversationRepository.updateContactIntake.mockResolvedValue(undefined);
    mockWebhookWorker.enqueue.mockResolvedValue({ id: 'webhook-job-1' });
  });

  it('queues a signed webhook before the worker retrieves knowledge, calls AI, and responds through Chatwoot', async () => {
    let signedRequest: ReturnType<typeof createSignedPayload> | undefined;
    await withServer(async (baseUrl) => {
      const { body, signature, timestamp } = createSignedPayload(
        'Sou tutora e quero agendar consulta para o Buddy'
      );
      signedRequest = { body, signature, timestamp };

      const response = await fetch(`${baseUrl}/webhooks/chatwoot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatwoot-signature': signature,
          'x-chatwoot-timestamp': timestamp,
        },
        body,
      });

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({ success: true, queued: true });
    });

    expect(mockWebhookWorker.enqueue).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      createHash('sha256')
        .update(signedRequest!.timestamp)
        .update('.')
        .update(signedRequest!.body)
        .digest('hex')
    );

    const [queuedPayload] = mockWebhookWorker.enqueue.mock.calls[0] as [ChatwootWebhookPayload];
    await processWebhookEvent(queuedPayload);

    expect(mockRedis.claimMessageHash).toHaveBeenCalledOnce();
    expect(mockRedis.claimContentHash).toHaveBeenCalledOnce();
    expect(mockRedis.releaseLock).toHaveBeenCalledOnce();
    expect(mockKnowledgeRetrieval.search).toHaveBeenCalledWith({
      query: 'Perfil do contato: tutor. Motivo do contato: quero agendar consulta para o Buddy.',
      limit: 3,
      minRelevance: 0.7,
    });
    expect(mockAiRouter.generate).toHaveBeenCalledWith({
      message: 'quero agendar consulta para o Buddy',
      context: expect.objectContaining({
        conversationId: 'conversation-123',
        contactId: 'contact-99',
        contactName: 'Maria',
        knowledge: [
          expect.objectContaining({
            id: 'chunk-1',
            content: 'Consultas podem ser agendadas de segunda a sabado.',
          }),
        ],
        schedulingState: expect.objectContaining({
          stage: 'collecting_details',
          petName: 'Buddy',
        }),
      }),
    });
    expect(mockChatwoot.sendMessage).toHaveBeenCalledWith({
      conversationId: 123,
      content: 'Posso verificar os horarios disponiveis para o Buddy.',
    });
    expect(mockAnalytics.trackEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'message_received',
      conversationId: 'conversation-123',
      contactId: '99',
    }));
    expect(mockAnalytics.trackEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'response_sent',
      conversationId: 'conversation-123',
      contactId: 'contact-99',
      metadata: expect.objectContaining({
        confidence: 0.94,
        action: 'respond',
      }),
    }));
  });

  it('starts a structured intake before calling knowledge or AI on a generic greeting', async () => {
    const { body } = createSignedPayload('Olá');
    await processWebhookEvent(JSON.parse(body) as ChatwootWebhookPayload);

    expect(mockConversationRepository.updateContactIntake).toHaveBeenCalledWith(
      'persisted-conversation-123',
      expect.objectContaining({
        stage: 'identification',
        unansweredAttempts: 1,
      })
    );
    expect(mockKnowledgeRetrieval.search).not.toHaveBeenCalled();
    expect(mockAiRouter.generate).not.toHaveBeenCalled();
    expect(mockChatwoot.sendMessage).toHaveBeenCalledWith({
      conversationId: 123,
      content: expect.stringContaining('tutor/cliente, colaborador ou fornecedor'),
    });
  });

  it('acknowledges a duplicate signed delivery without queueing it again', async () => {
    mockWebhookWorker.enqueue.mockResolvedValueOnce(null);

    await withServer(async (baseUrl) => {
      const { body, signature, timestamp } = createSignedPayload('mensagem repetida');
      const response = await fetch(`${baseUrl}/webhooks/chatwoot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatwoot-signature': signature,
          'x-chatwoot-timestamp': timestamp,
        },
        body,
      });

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({
        success: true,
        queued: false,
        duplicate: true,
      });
    });
  });
});
