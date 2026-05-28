import http from 'http';
import { AddressInfo } from 'net';
import { createHmac } from 'crypto';

const mockRuntime = vi.hoisted(() => ({
  processWebhookEvent: vi.fn(),
  processConversationCreated: vi.fn(),
}));

const mockKnowledgeRetrieval = vi.hoisted(() => ({
  healthCheck: vi.fn(async () => true),
}));

vi.mock('../../src/modules/runtime/agentRuntime', () => mockRuntime);
vi.mock('../../src/modules/chatwoot/client', () => ({
  chatwootClient: { healthCheck: vi.fn(async () => true) },
}));
vi.mock('../../src/shared/redis', () => ({
  redisClient: { ping: vi.fn(async () => true) },
}));
vi.mock('../../src/modules/openai/client', () => ({
  openaiClient: { healthCheck: vi.fn(async () => true) },
}));
vi.mock('../../src/shared/db', () => ({
  checkDatabaseConnection: vi.fn(async () => true),
}));
vi.mock('../../src/modules/analytics/index', () => ({
  analyticsService: {
    getEventStats: vi.fn(async () => ({
      conversationsStarted: 0,
      conversationsEnded: 0,
      handoffs: 0,
      fallbacks: 0,
      errors: 0,
      avgResponseLatency: 0,
    })),
  },
}));
vi.mock('../../src/modules/knowledge/adminRoutes', async () => {
  const express = await vi.importActual<typeof import('express')>('express');
  return { knowledgeAdminRouter: express.Router() };
});
vi.mock('../../src/modules/knowledge/retrieval', () => ({
  knowledgeRetrievalService: mockKnowledgeRetrieval,
}));

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

describe('app security controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKnowledgeRetrieval.healthCheck.mockResolvedValue(true);
  });

  it('reports knowledge retrieval in health checks', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.dependencies.knowledge).toBe('connected');
      expect(mockKnowledgeRetrieval.healthCheck).toHaveBeenCalledOnce();
    });
  });

  it('degrades health when knowledge retrieval is unavailable', async () => {
    mockKnowledgeRetrieval.healthCheck.mockResolvedValue(false);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.status).toBe('degraded');
      expect(body.dependencies.knowledge).toBe('error');
    });
  });

  it('rejects operational API requests without a token', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/metrics`);

      expect(response.status).toBe(401);
    });
  });

  it('enforces RBAC after authentication', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/audit/events`, {
        headers: {
          'x-api-key': 'test-admin-token',
          'x-user-role': 'viewer',
        },
      });

      expect(response.status).toBe(403);
    });
  });

  it('rejects chatwoot webhooks with an invalid signature', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/webhooks/chatwoot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatwoot-signature': 'sha256=deadbeef',
        },
        body: JSON.stringify({ event: 'message_created' }),
      });

      expect(response.status).toBe(401);
      expect(mockRuntime.processWebhookEvent).not.toHaveBeenCalled();
    });
  });

  it('accepts signed chatwoot webhooks before dispatching to runtime', async () => {
    await withServer(async (baseUrl) => {
      const body = JSON.stringify({
        event: 'message_created',
        message: {
          id: 1,
          content: 'oi',
          message_type: 'incoming',
          sender: { name: 'Maria', type: 'contact' },
          private: false,
        },
        conversation: {
          id: 1,
          uuid: 'conversation-1',
          inbox_id: 1,
          account_id: 1,
          contact: { id: 1, name: 'Maria' },
        },
      });

      const response = await fetch(`${baseUrl}/webhooks/chatwoot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatwoot-signature': signBody(body),
        },
        body,
      });

      expect(response.status).toBe(200);
      expect(mockRuntime.processWebhookEvent).toHaveBeenCalledOnce();
    });
  });
});
