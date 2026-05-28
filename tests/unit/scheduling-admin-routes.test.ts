import http from 'http';
import { AddressInfo } from 'net';

const mockRuntime = vi.hoisted(() => ({
  processWebhookEvent: vi.fn(),
  processConversationCreated: vi.fn(),
}));

const mockSchedulingRepository = vi.hoisted(() => ({
  listServices: vi.fn(),
  createService: vi.fn(),
  listProviders: vi.fn(),
  createProvider: vi.fn(),
  listSlots: vi.fn(),
  createSlot: vi.fn(),
}));

const mockKnowledgeRetrieval = vi.hoisted(() => ({
  healthCheck: vi.fn(async () => true),
}));

vi.mock('../../src/modules/runtime/agentRuntime', () => mockRuntime);
vi.mock('../../src/modules/scheduling/repository', () => ({
  schedulingRepository: mockSchedulingRepository,
}));
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

function authHeaders(role = 'admin'): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': 'test-admin-token',
    'x-user-role': role,
    'x-user-id': 'manager-1',
  };
}

describe('scheduling admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication for scheduling endpoints', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/scheduling/services`);

      expect(response.status).toBe(401);
    });
  });

  it('allows viewers to list services', async () => {
    mockSchedulingRepository.listServices.mockResolvedValue([
      { id: 'service-1', name: 'Consulta', durationMinutes: 30, requiresHumanApproval: false, isActive: true },
    ]);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/scheduling/services`, {
        headers: authHeaders('viewer'),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.count).toBe(1);
      expect(mockSchedulingRepository.listServices).toHaveBeenCalledOnce();
    });
  });

  it('rejects viewers when creating services', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/scheduling/services`, {
        method: 'POST',
        headers: authHeaders('viewer'),
        body: JSON.stringify({ name: 'Consulta' }),
      });

      expect(response.status).toBe(403);
      expect(mockSchedulingRepository.createService).not.toHaveBeenCalled();
    });
  });

  it('creates appointment services with validated input', async () => {
    mockSchedulingRepository.createService.mockResolvedValue({
      id: 'service-1',
      name: 'Consulta clinica',
      durationMinutes: 30,
      requiresHumanApproval: false,
      isActive: true,
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/scheduling/services`, {
        method: 'POST',
        headers: authHeaders('agent'),
        body: JSON.stringify({
          name: 'Consulta clinica',
          durationMinutes: 30,
          requiresHumanApproval: false,
        }),
      });

      expect(response.status).toBe(201);
      expect(mockSchedulingRepository.createService).toHaveBeenCalledWith({
        name: 'Consulta clinica',
        durationMinutes: 30,
        requiresHumanApproval: false,
      });
    });
  });

  it('creates appointment providers', async () => {
    mockSchedulingRepository.createProvider.mockResolvedValue({
      id: 'provider-1',
      name: 'Dra Ana',
      sector: 'clinica',
      isActive: true,
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/scheduling/providers`, {
        method: 'POST',
        headers: authHeaders('manager'),
        body: JSON.stringify({
          name: 'Dra Ana',
          sector: 'clinica',
        }),
      });

      expect(response.status).toBe(201);
      expect(mockSchedulingRepository.createProvider).toHaveBeenCalledWith({
        name: 'Dra Ana',
        sector: 'clinica',
      });
    });
  });

  it('lists appointment slots with query filters', async () => {
    mockSchedulingRepository.listSlots.mockResolvedValue([
      {
        id: 'slot-1',
        serviceId: null,
        providerId: null,
        startsAt: new Date('2026-06-01T13:00:00.000Z'),
        endsAt: new Date('2026-06-01T13:30:00.000Z'),
        status: 'available',
      },
    ]);

    await withServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/scheduling/slots?from=2026-06-01T00:00:00.000Z&to=2026-06-02T00:00:00.000Z&status=available&limit=10`,
        { headers: authHeaders('viewer') }
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.count).toBe(1);
      expect(mockSchedulingRepository.listSlots).toHaveBeenCalledWith({
        from: new Date('2026-06-01T00:00:00.000Z'),
        to: new Date('2026-06-02T00:00:00.000Z'),
        serviceId: undefined,
        providerId: undefined,
        status: 'available',
        limit: 10,
      });
    });
  });

  it('rejects invalid slots before repository calls', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/scheduling/slots`, {
        method: 'POST',
        headers: authHeaders('manager'),
        body: JSON.stringify({
          startsAt: '2026-06-01T13:30:00.000Z',
          endsAt: '2026-06-01T13:00:00.000Z',
        }),
      });

      expect(response.status).toBe(400);
      expect(mockSchedulingRepository.createSlot).not.toHaveBeenCalled();
    });
  });

  it('creates appointment slots with validated dates', async () => {
    mockSchedulingRepository.createSlot.mockResolvedValue({
      id: 'slot-1',
      serviceId: null,
      providerId: null,
      startsAt: new Date('2026-06-01T13:00:00.000Z'),
      endsAt: new Date('2026-06-01T13:30:00.000Z'),
      status: 'available',
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/scheduling/slots`, {
        method: 'POST',
        headers: authHeaders('manager'),
        body: JSON.stringify({
          startsAt: '2026-06-01T13:00:00.000Z',
          endsAt: '2026-06-01T13:30:00.000Z',
          metadata: { room: '1' },
        }),
      });

      expect(response.status).toBe(201);
      expect(mockSchedulingRepository.createSlot).toHaveBeenCalledWith({
        startsAt: new Date('2026-06-01T13:00:00.000Z'),
        endsAt: new Date('2026-06-01T13:30:00.000Z'),
        metadata: { room: '1' },
      });
    });
  });
});
