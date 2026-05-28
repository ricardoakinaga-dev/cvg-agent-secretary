import http from 'http';
import { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import { ChatwootWebhookPayload, ConversationContext } from '../../src/shared/types';

const mockRedis = vi.hoisted(() => ({
  ping: vi.fn(async () => true),
  checkMessageHash: vi.fn(),
  setMessageHash: vi.fn(),
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
}));

const mockSchedulingState = vi.hoisted(() => ({
  handleSchedulingStateMachine: vi.fn(),
  markSchedulingIntent: vi.fn(),
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
  generateFallbackResponse: vi.fn(() => 'Vou chamar um atendente.'),
}));
vi.mock('../../src/modules/intent/classifier', () => ({
  classifyIntent: vi.fn(() => ({ intent: 'agendamento', entities: { petName: 'Buddy' } })),
}));
vi.mock('../../src/modules/scheduling/state', () => mockSchedulingState);
vi.mock('../../src/modules/conversations/contextLoader', () => mockContextLoader);
vi.mock('../../src/modules/knowledge/adminRoutes', async () => {
  const express = await vi.importActual<typeof import('express')>('express');
  return { knowledgeAdminRouter: express.Router() };
});
vi.mock('../../src/modules/scheduling/adminRoutes', async () => {
  const express = await vi.importActual<typeof import('express')>('express');
  return { schedulingAdminRouter: express.Router() };
});

import { app } from '../../src/app';

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

function signBody(body: string): string {
  return `sha256=${createHmac('sha256', 'test-webhook-secret').update(Buffer.from(body)).digest('hex')}`;
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

function createSignedPayload(content: string): { body: string; signature: string } {
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
  return { body, signature: signBody(body) };
}

describe('signed Chatwoot webhook to agent response flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.checkMessageHash.mockResolvedValue(false);
    mockRedis.setMessageHash.mockResolvedValue(undefined);
    mockContextLoader.loadConversationContext.mockResolvedValue(createConversationContext());
    mockContextLoader.addMessageToContext.mockImplementation(async (context) => context);
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
  });

  it('accepts a signed Chatwoot webhook, retrieves knowledge, calls AI, and sends the response back to Chatwoot', async () => {
    await withServer(async (baseUrl) => {
      const { body, signature } = createSignedPayload('quero agendar consulta para o Buddy');

      const response = await fetch(`${baseUrl}/webhooks/chatwoot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatwoot-signature': signature,
        },
        body,
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
    });

    expect(mockRedis.checkMessageHash).toHaveBeenCalledOnce();
    expect(mockKnowledgeRetrieval.search).toHaveBeenCalledWith({
      query: 'quero agendar consulta para o Buddy',
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
});
