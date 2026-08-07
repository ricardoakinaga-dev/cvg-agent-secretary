import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { Role } from '../../src/modules/auth/rbac';

const mockKnowledgeRepository = vi.hoisted(() => ({
  createDocument: vi.fn(),
  approveDocument: vi.fn(),
  rejectDocument: vi.fn(),
  publishDocument: vi.fn(),
}));

vi.mock('../../src/modules/knowledge/repository', () => ({
  knowledgeRepository: mockKnowledgeRepository,
}));

import { knowledgeAdminRouter } from '../../src/modules/knowledge/adminRoutes';

interface TestPrincipal {
  id: string;
  role: Role;
}

async function withServer<T>(principal: TestPrincipal, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    _req.user = principal;
    next();
  });
  app.use('/knowledge', knowledgeAdminRouter);

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

describe('knowledge admin verified actor attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the authenticated user as createdBy and ignores a body conflict', async () => {
    mockKnowledgeRepository.createDocument.mockResolvedValue({ id: 'doc-1' });

    await withServer({ id: 'agent-1', role: 'agent' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/knowledge/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Emergency contacts',
          content: 'Contact the veterinary team immediately.',
          category: 'procedure',
          createdBy: 'attacker',
        }),
      });

      expect(response.status).toBe(201);
      expect(mockKnowledgeRepository.createDocument).toHaveBeenCalledWith({
        title: 'Emergency contacts',
        content: 'Contact the veterinary team immediately.',
        category: 'procedure',
        createdBy: 'agent-1',
      });
    });
  });

  it('denies document creation without the required role permission', async () => {
    await withServer({ id: 'viewer-1', role: 'viewer' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/knowledge/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Emergency contacts',
          content: 'Contact the veterinary team immediately.',
          category: 'procedure',
        }),
      });

      expect(response.status).toBe(403);
      expect(mockKnowledgeRepository.createDocument).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['approve', 'approveDocument', { actor: 'attacker' }],
    ['reject', 'rejectDocument', { actor: 'attacker', reason: 'Needs revision' }],
    ['publish', 'publishDocument', { approvedBy: 'attacker' }],
  ] as const)(
    'uses the authenticated user for %s operations',
    async (operation, repositoryMethod, body) => {
      mockKnowledgeRepository[repositoryMethod].mockResolvedValue({ id: 'doc-1' });

      await withServer({ id: 'manager-1', role: 'manager' }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/knowledge/documents/doc-1/${operation}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        expect(response.status).toBe(200);
        if (operation === 'reject') {
          expect(mockKnowledgeRepository.rejectDocument).toHaveBeenCalledWith(
            'doc-1',
            expect.objectContaining({
              id: 'manager-1',
              role: 'manager',
              source: 'signed_identity',
            }),
            'Needs revision'
          );
        } else {
          expect(mockKnowledgeRepository[repositoryMethod]).toHaveBeenCalledWith(
            'doc-1',
            expect.objectContaining({
              id: 'manager-1',
              role: 'manager',
              source: 'signed_identity',
            })
          );
        }
      });
    }
  );

  it('denies approval when the authenticated role lacks permission', async () => {
    await withServer({ id: 'agent-1', role: 'agent' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/knowledge/documents/doc-1/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'manager-1' }),
      });

      expect(response.status).toBe(403);
      expect(mockKnowledgeRepository.approveDocument).not.toHaveBeenCalled();
    });
  });
});
