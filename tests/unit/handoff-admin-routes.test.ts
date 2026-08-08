import express, { NextFunction, Request, Response as ExpressResponse } from 'express';
import http from 'http';
import { AddressInfo } from 'net';

const mocks = vi.hoisted(() => ({
  repository: {
    findByConversation: vi.fn(),
  },
  resolve: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('../../src/modules/handoff/repository', () => ({ handoffRepository: mocks.repository }));
vi.mock('../../src/modules/handoff/controlService', () => ({ resolveHandoffControl: mocks.resolve }));
vi.mock('../../src/modules/audit/service', () => ({
  auditService: { recordEvent: mocks.audit },
  createAuthenticatedAuditPrincipal: (user: Request['user'], correlationId?: string) => ({
    id: user?.id,
    role: user?.role,
    source: 'signed_identity',
    correlationId,
  }),
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { handoffAdminRouter } from '../../src/modules/handoff/adminRoutes';

const conversationId = '11111111-1111-4111-8111-111111111111';

async function withServer<T>(
  principal: { id: string; role: 'admin' | 'manager' | 'agent' | 'viewer' },
  fn: (baseUrl: string) => Promise<T>
): Promise<T> {
  const application = express();
  application.use(express.json());
  application.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    req.user = principal;
    next();
  });
  application.use('/conversations', handoffAdminRouter);
  const server = http.createServer(application);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe('handoff admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.findByConversation.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      conversationId,
      triggerType: 'agent_response',
      status: 'in_progress',
      priority: 'medium',
      summary: 'Review',
      pendingQuestions: [],
      riskLevel: 'medium',
      createdAt: new Date('2026-08-08T00:00:00.000Z'),
      completedAt: null,
      resolvedBy: null,
    });
    mocks.resolve.mockResolvedValue({
      action: 'resume',
      handoffId: '22222222-2222-4222-8222-222222222222',
      controlState: 'automated',
      controlVersion: 5,
    });
    mocks.audit.mockResolvedValue(undefined);
  });

  it('returns a safe handoff projection and records an operator resolution', async () => {
    await withServer({ id: 'operator-1', role: 'agent' }, async (baseUrl) => {
      const lookup = await fetch(`${baseUrl}/conversations/${conversationId}/handoff`);
      expect(lookup.status).toBe(200);
      await expect(lookup.json()).resolves.toMatchObject({
        handoff: { id: '22222222-2222-4222-8222-222222222222', status: 'in_progress' },
      });

      const response = await fetch(`${baseUrl}/conversations/${conversationId}/handoff/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': 'corr-1' },
        body: JSON.stringify({ action: 'resume', reason: 'Operador confirmou a retomada' }),
      });
      expect(response.status).toBe(200);
      expect(mocks.resolve).toHaveBeenCalledWith({
        conversationId,
        action: 'resume',
        reason: 'Operador confirmou a retomada',
        actorId: 'operator-1',
      });
      expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
        actor: 'operator-1',
        action: 'handoff_resume',
        details: expect.objectContaining({ reasonHash: expect.any(String) }),
      }));
    });
  });

  it('rejects invalid input and viewers cannot resolve a handoff', async () => {
    await withServer({ id: 'operator-1', role: 'agent' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/conversations/${conversationId}/handoff/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'resume', reason: 'x' }),
      });
      expect(response.status).toBe(400);
      expect(mocks.resolve).not.toHaveBeenCalled();
    });

    await withServer({ id: 'viewer-1', role: 'viewer' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/conversations/${conversationId}/handoff/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'resume', reason: 'Operador confirmou a retomada' }),
      });
      expect(response.status).toBe(403);
      expect(mocks.resolve).not.toHaveBeenCalled();
    });
  });
});
