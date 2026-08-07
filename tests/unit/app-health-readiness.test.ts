import http from 'http';
import { AddressInfo } from 'net';

const dependencyMocks = vi.hoisted(() => ({
  redisPing: vi.fn(async () => true),
  databaseCheck: vi.fn(async () => true),
  chatwootHealth: vi.fn(async () => true),
  openaiHealth: vi.fn(async () => true),
  knowledgeHealth: vi.fn(async () => true),
}));

vi.mock('../../src/shared/redis', () => ({
  redisClient: { ping: dependencyMocks.redisPing },
}));
vi.mock('../../src/shared/db', () => ({
  checkDatabaseConnection: dependencyMocks.databaseCheck,
}));
vi.mock('../../src/modules/chatwoot/client', () => ({
  chatwootClient: { healthCheck: dependencyMocks.chatwootHealth },
}));
vi.mock('../../src/modules/openai/client', () => ({
  openaiClient: { healthCheck: dependencyMocks.openaiHealth },
}));
vi.mock('../../src/modules/knowledge/retrieval', () => ({
  knowledgeRetrievalService: { healthCheck: dependencyMocks.knowledgeHealth },
}));
vi.mock('../../src/modules/webhook/worker', () => ({
  chatwootWebhookWorker: { enqueue: vi.fn() },
}));
vi.mock('../../src/modules/analytics/index', () => ({
  analyticsService: { getEventStats: vi.fn() },
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

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

describe('health and readiness endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencyMocks.redisPing.mockResolvedValue(true);
    dependencyMocks.databaseCheck.mockResolvedValue(true);
  });

  it('keeps liveness local and does not expose dependency details', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ status: 'healthy', version: '1.0.0' });
      expect(body).not.toHaveProperty('dependencies');
      expect(dependencyMocks.redisPing).not.toHaveBeenCalled();
      expect(dependencyMocks.databaseCheck).not.toHaveBeenCalled();
      expect(dependencyMocks.chatwootHealth).not.toHaveBeenCalled();
      expect(dependencyMocks.openaiHealth).not.toHaveBeenCalled();
      expect(dependencyMocks.knowledgeHealth).not.toHaveBeenCalled();
    });
  });

  it('caches readiness and never probes SaaS providers', async () => {
    await withServer(async (baseUrl) => {
      const first = await fetch(`${baseUrl}/ready`);
      const second = await fetch(`${baseUrl}/ready`);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(dependencyMocks.redisPing).toHaveBeenCalledOnce();
      expect(dependencyMocks.databaseCheck).toHaveBeenCalledOnce();
      expect(dependencyMocks.chatwootHealth).not.toHaveBeenCalled();
      expect(dependencyMocks.openaiHealth).not.toHaveBeenCalled();
      expect(dependencyMocks.knowledgeHealth).not.toHaveBeenCalled();
    });
  });

  it('fails readiness within a bounded time when a dependency hangs', async () => {
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now + 10_000);
    dependencyMocks.redisPing.mockImplementation(() => new Promise<boolean>(() => undefined));

    try {
      await withServer(async (baseUrl) => {
        const startedAt = performance.now();
        const response = await fetch(`${baseUrl}/ready`);
        const elapsedMs = performance.now() - startedAt;

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({ ready: false });
        expect(elapsedMs).toBeLessThan(1_500);
      });
    } finally {
      dateSpy.mockRestore();
    }
  });
});
