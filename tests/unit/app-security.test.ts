import http from 'http';
import { AddressInfo } from 'net';
import { createHmac } from 'crypto';

const mockRuntime = vi.hoisted(() => ({
  processWebhookEvent: vi.fn(),
  processConversationCreated: vi.fn(),
}));

const mockWebhookWorker = vi.hoisted(() => ({
  enqueue: vi.fn(),
}));

const mockKnowledgeRetrieval = vi.hoisted(() => ({
  healthCheck: vi.fn(async () => true),
}));

const mockRedis = vi.hoisted(() => ({
  ping: vi.fn(async () => true),
}));

const mockDatabase = vi.hoisted(() => ({
  checkDatabaseConnection: vi.fn(async () => true),
}));

const mockAudit = vi.hoisted(() => ({
  getEvents: vi.fn(async () => []),
}));

vi.mock('../../src/modules/runtime/agentRuntime', () => mockRuntime);
vi.mock('../../src/modules/webhook/worker', () => ({
  chatwootWebhookWorker: mockWebhookWorker,
}));
vi.mock('../../src/modules/chatwoot/client', () => ({
  chatwootClient: { healthCheck: vi.fn(async () => true) },
}));
vi.mock('../../src/shared/redis', () => ({
  redisClient: mockRedis,
}));
vi.mock('../../src/modules/openai/client', () => ({
  openaiClient: { healthCheck: vi.fn(async () => true) },
}));
vi.mock('../../src/shared/db', () => ({
  checkDatabaseConnection: mockDatabase.checkDatabaseConnection,
}));
vi.mock('../../src/modules/audit/service', () => ({
  auditService: mockAudit,
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

function signBody(body: string, timestamp: string): string {
  return `sha256=${createHmac('sha256', 'test-webhook-secret').update(`${timestamp}.${body}`).digest('hex')}`;
}

describe('app security controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKnowledgeRetrieval.healthCheck.mockResolvedValue(true);
    mockRedis.ping.mockResolvedValue(true);
    mockDatabase.checkDatabaseConnection.mockResolvedValue(true);
    mockAudit.getEvents.mockResolvedValue([]);
    mockWebhookWorker.enqueue.mockResolvedValue({ id: 'webhook-job-1' });
  });

  it('keeps liveness local and does not disclose dependency details', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      const body = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body.status).toBe('healthy');
      expect(body).not.toHaveProperty('dependencies');
      expect(mockKnowledgeRetrieval.healthCheck).not.toHaveBeenCalled();
    });
  });

  it('reports not ready when a required local store is unavailable', async () => {
    mockRedis.ping.mockResolvedValue(false);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ready`);
      const body = await response.json() as { ready: boolean };

      expect(response.status).toBe(503);
      expect(body.ready).toBe(false);
    });
  });

  it('rejects operational API requests without a token', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/metrics`);

      expect(response.status).toBe(401);
    });
  });

  it('ignores an untrusted role header and uses the server-side principal', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/audit/events`, {
        headers: {
          'x-api-key': 'test-admin-token',
          'x-user-role': 'viewer',
        },
      });

      expect(response.status).toBe(200);
      expect(mockAudit.getEvents).toHaveBeenCalledOnce();
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

  it('queues signed chatwoot webhooks and responds before runtime processing', async () => {
    await withServer(async (baseUrl) => {
      const body = JSON.stringify({
        event: 'message_created',
        message: {
          id: 1,
          content: 'oi',
          message_type: 'incoming',
          sender: { id: 1, name: 'Maria', type: 'contact' },
          private: false,
        },
        conversation: {
          id: 1,
          uuid: 'conversation-1',
          inbox_id: 1,
          account_id: 1,
          status: 'open',
          contact: { id: 1, name: 'Maria' },
        },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const response = await fetch(`${baseUrl}/webhooks/chatwoot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatwoot-signature': signBody(body, timestamp),
          'x-chatwoot-timestamp': timestamp,
        },
        body,
      });

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({ success: true, queued: true });
      expect(mockWebhookWorker.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'message_created' }),
        expect.any(String),
        expect.stringMatching(/^[a-f\d]{64}$/)
      );
      expect(mockRuntime.processWebhookEvent).not.toHaveBeenCalled();
    });
  });
});
