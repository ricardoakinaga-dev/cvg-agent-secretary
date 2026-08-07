import express, { NextFunction, Request, Response as ExpressResponse } from 'express';
import http from 'http';
import { AddressInfo } from 'net';

const adminMocks = vi.hoisted(() => ({
  knowledge: {
    listDocuments: vi.fn(),
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    submitForReview: vi.fn(),
    approveDocument: vi.fn(),
    rejectDocument: vi.fn(),
    publishDocument: vi.fn(),
  },
  scheduling: {
    listServices: vi.fn(),
    createService: vi.fn(),
    listProviders: vi.fn(),
    createProvider: vi.fn(),
    listSlots: vi.fn(),
    createSlot: vi.fn(),
  },
}));

vi.mock('../../src/modules/knowledge/repository', () => ({
  knowledgeRepository: adminMocks.knowledge,
}));
vi.mock('../../src/modules/scheduling/repository', () => ({
  schedulingRepository: adminMocks.scheduling,
}));

import { knowledgeAdminRouter } from '../../src/modules/knowledge/adminRoutes';
import { schedulingAdminRouter } from '../../src/modules/scheduling/adminRoutes';

async function withServer<T>(
  fn: (baseUrl: string) => Promise<T>,
  principal: { id: string; role: 'admin' | 'manager' | 'agent' | 'viewer' } = {
    id: 'manager-1',
    role: 'manager',
  }
): Promise<T> {
  const application = express();
  application.use(express.json());
  application.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    req.user = principal;
    next();
  });
  application.use('/knowledge', knowledgeAdminRouter);
  application.use('/scheduling', schedulingAdminRouter);

  const server = http.createServer(application);
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

async function requestJson(
  baseUrl: string,
  path: string,
  method = 'GET',
  body?: unknown
): Promise<globalThis.Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('knowledge admin route completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(adminMocks.knowledge)) mock.mockReset();
  });

  it('lists filtered documents and clamps finite limits to the supported range', async () => {
    adminMocks.knowledge.listDocuments.mockResolvedValue([{ id: 'doc-1' }]);

    await withServer(async (baseUrl) => {
      const filtered = await requestJson(
        baseUrl,
        '/knowledge/documents?status=published&category=faq&limit=999'
      );
      expect(filtered.status).toBe(200);
      await expect(filtered.json()).resolves.toMatchObject({ count: 1 });
      expect(adminMocks.knowledge.listDocuments).toHaveBeenLastCalledWith({
        status: 'published',
        category: 'faq',
        limit: 100,
      });

      await requestJson(baseUrl, '/knowledge/documents?limit=-10');
      expect(adminMocks.knowledge.listDocuments).toHaveBeenLastCalledWith({
        status: undefined,
        category: undefined,
        limit: 1,
      });

      await requestJson(baseUrl, '/knowledge/documents?limit=Infinity');
      expect(adminMocks.knowledge.listDocuments).toHaveBeenLastCalledWith({
        status: undefined,
        category: undefined,
        limit: 50,
      });
    });
  });

  it('rejects invalid list filters and repository failures', async () => {
    await withServer(async (baseUrl) => {
      const invalid = await requestJson(baseUrl, '/knowledge/documents?status=unknown');
      expect(invalid.status).toBe(400);
      expect(adminMocks.knowledge.listDocuments).not.toHaveBeenCalled();

      adminMocks.knowledge.listDocuments.mockRejectedValue(new Error('database failed'));
      const failed = await requestJson(baseUrl, '/knowledge/documents');
      expect(failed.status).toBe(400);
      await expect(failed.json()).resolves.toMatchObject({ error: 'Invalid knowledge list request' });
    });
  });

  it('updates and submits a document for review', async () => {
    adminMocks.knowledge.updateDocument.mockResolvedValue({ id: 'doc-1', title: 'Updated title' });
    adminMocks.knowledge.submitForReview.mockResolvedValue({ id: 'doc-1', status: 'pending_review' });

    await withServer(async (baseUrl) => {
      const updated = await requestJson(baseUrl, '/knowledge/documents/doc-1', 'PATCH', {
        title: 'Updated title',
        content: 'Updated institutional guidance.',
        category: 'policy',
        tags: ['hospital'],
        metadata: { version: 2 },
      });
      expect(updated.status).toBe(200);
      expect(adminMocks.knowledge.updateDocument).toHaveBeenCalledWith({
        id: 'doc-1',
        title: 'Updated title',
        content: 'Updated institutional guidance.',
        category: 'policy',
        tags: ['hospital'],
        metadata: { version: 2 },
      });

      const submitted = await requestJson(
        baseUrl,
        '/knowledge/documents/doc-1/submit-review',
        'POST',
        {}
      );
      expect(submitted.status).toBe(200);
      expect(adminMocks.knowledge.submitForReview).toHaveBeenCalledWith('doc-1');
    });
  });

  it('allows a rejection without an optional reason body', async () => {
    adminMocks.knowledge.rejectDocument.mockResolvedValue({ id: 'doc-1', status: 'rejected' });

    await withServer(async (baseUrl) => {
      const response = await requestJson(
        baseUrl,
        '/knowledge/documents/doc-1/reject',
        'POST'
      );
      expect(response.status).toBe(200);
      expect(adminMocks.knowledge.rejectDocument).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({
          id: 'manager-1',
          role: 'manager',
          source: 'signed_identity',
        }),
        undefined
      );
    });
  });

  it.each([
    ['PATCH', '/knowledge/documents/doc-1', 'updateDocument', 'Invalid knowledge update'],
    ['POST', '/knowledge/documents/doc-1/submit-review', 'submitForReview', 'Could not submit knowledge document for review'],
    ['POST', '/knowledge/documents/doc-1/approve', 'approveDocument', 'Could not approve knowledge document'],
    ['POST', '/knowledge/documents/doc-1/reject', 'rejectDocument', 'Could not reject knowledge document'],
    ['POST', '/knowledge/documents/doc-1/publish', 'publishDocument', 'Could not publish knowledge document'],
  ] as const)(
    'handles %s %s repository failures',
    async (method, path, repositoryMethod, expectedError) => {
      adminMocks.knowledge[repositoryMethod].mockRejectedValue(new Error('repository failed'));

      await withServer(async (baseUrl) => {
        const response = await requestJson(
          baseUrl,
          path,
          method,
          repositoryMethod === 'rejectDocument' ? { reason: 'Needs details' } : {}
        );
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ error: expectedError });
      });
    }
  );

  it('rejects invalid creation and review inputs before persistence', async () => {
    await withServer(async (baseUrl) => {
      const create = await requestJson(baseUrl, '/knowledge/documents', 'POST', {
        title: 'No',
        content: 'short',
        category: 'unknown',
      });
      expect(create.status).toBe(400);
      expect(adminMocks.knowledge.createDocument).not.toHaveBeenCalled();

      const reject = await requestJson(baseUrl, '/knowledge/documents/doc-1/reject', 'POST', {
        reason: 'x',
      });
      expect(reject.status).toBe(400);
      expect(adminMocks.knowledge.rejectDocument).not.toHaveBeenCalled();
    });
  });

  it('fails closed when an actor id is missing for an attribution-sensitive action', async () => {
    await withServer(async (baseUrl) => {
      const response = await requestJson(
        baseUrl,
        '/knowledge/documents/doc-1/publish',
        'POST',
        {}
      );
      expect(response.status).toBe(400);
      expect(adminMocks.knowledge.publishDocument).not.toHaveBeenCalled();
    }, { id: '', role: 'manager' });
  });
});

describe('scheduling admin route completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(adminMocks.scheduling)) mock.mockReset();
  });

  it('lists providers and defaults slot searches to a thirty-day window', async () => {
    adminMocks.scheduling.listProviders.mockResolvedValue([{ id: 'provider-1' }]);
    adminMocks.scheduling.listSlots.mockResolvedValue([{ id: 'slot-1' }]);

    await withServer(async (baseUrl) => {
      const providers = await requestJson(baseUrl, '/scheduling/providers');
      expect(providers.status).toBe(200);
      await expect(providers.json()).resolves.toMatchObject({ count: 1 });

      const before = Date.now();
      const slots = await requestJson(baseUrl, '/scheduling/slots');
      const after = Date.now();
      expect(slots.status).toBe(200);
      const [input] = adminMocks.scheduling.listSlots.mock.calls[0] as [{ from: Date; to: Date }];
      expect(input.from.getTime()).toBeGreaterThanOrEqual(before);
      expect(input.from.getTime()).toBeLessThanOrEqual(after);
      expect(input.to.getTime() - input.from.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
      expect(input).toMatchObject({
        serviceId: undefined,
        providerId: undefined,
        status: undefined,
        limit: undefined,
      });
    });
  });

  it.each([
    ['GET', '/scheduling/services', 'listServices', 500, 'Could not list appointment services'],
    ['POST', '/scheduling/services', 'createService', 400, 'Invalid appointment service'],
    ['GET', '/scheduling/providers', 'listProviders', 500, 'Could not list appointment providers'],
    ['POST', '/scheduling/providers', 'createProvider', 400, 'Invalid appointment provider'],
    ['GET', '/scheduling/slots', 'listSlots', 400, 'Invalid appointment slot list request'],
    ['POST', '/scheduling/slots', 'createSlot', 400, 'Invalid appointment slot'],
  ] as const)(
    'maps %s %s repository errors',
    async (method, path, repositoryMethod, expectedStatus, expectedError) => {
      adminMocks.scheduling[repositoryMethod].mockRejectedValue(new Error('repository failed'));
      const bodies: Record<string, unknown> = {
        createService: { name: 'Consulta' },
        createProvider: { name: 'Dra Ana' },
        createSlot: {
          startsAt: '2026-08-03T10:00:00.000Z',
          endsAt: '2026-08-03T11:00:00.000Z',
        },
      };

      await withServer(async (baseUrl) => {
        const response = await requestJson(baseUrl, path, method, bodies[repositoryMethod]);
        expect(response.status).toBe(expectedStatus);
        await expect(response.json()).resolves.toMatchObject({ error: expectedError });
      });
    }
  );

  it('rejects invalid service, provider, and slot-list input before persistence', async () => {
    await withServer(async (baseUrl) => {
      const service = await requestJson(baseUrl, '/scheduling/services', 'POST', { name: 'x' });
      expect(service.status).toBe(400);

      const provider = await requestJson(baseUrl, '/scheduling/providers', 'POST', { name: 'x' });
      expect(provider.status).toBe(400);

      const slots = await requestJson(
        baseUrl,
        '/scheduling/slots?from=2026-08-04T00:00:00.000Z&to=2026-08-03T00:00:00.000Z'
      );
      expect(slots.status).toBe(400);

      expect(adminMocks.scheduling.createService).not.toHaveBeenCalled();
      expect(adminMocks.scheduling.createProvider).not.toHaveBeenCalled();
      expect(adminMocks.scheduling.listSlots).not.toHaveBeenCalled();
    });
  });
});
