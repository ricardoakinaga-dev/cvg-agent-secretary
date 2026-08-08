import express, { NextFunction, Request, Response as ExpressResponse } from 'express';
import http from 'http';
import { AddressInfo } from 'net';

const mocks = vi.hoisted(() => ({
  repository: {
    listReconciliationCandidates: vi.fn(),
    reconcile: vi.fn(),
  },
  audit: vi.fn(),
}));

vi.mock('../../src/modules/agent-tools/executionRepository', () => ({
  toolExecutionRepository: mocks.repository,
}));
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
import { agentToolsAdminRouter } from '../../src/modules/agent-tools/adminRoutes';

const executionId = '11111111-1111-4111-8111-111111111111';

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
  application.use('/tools', agentToolsAdminRouter);
  const server = http.createServer(application);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe('agent tool reconciliation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.listReconciliationCandidates.mockResolvedValue([{
      id: executionId,
      conversationId: null,
      toolName: 'notify_sector',
      status: 'error',
      errorMessage: 'Provider unavailable',
      createdAt: new Date('2026-08-08T00:00:00.000Z'),
    }]);
    mocks.repository.reconcile.mockResolvedValue({
      id: executionId,
      conversationId: null,
      toolName: 'notify_sector',
      status: 'reconciled',
      errorMessage: 'Confirmado no sistema externo',
      createdAt: new Date('2026-08-08T00:00:00.000Z'),
    });
    mocks.audit.mockResolvedValue(undefined);
  });

  it('lists candidates and records an explicit confirmation decision', async () => {
    await withServer({ id: 'manager-1', role: 'manager' }, async (baseUrl) => {
      const list = await fetch(`${baseUrl}/tools/reconciliation?limit=9`);
      expect(list.status).toBe(200);
      expect(mocks.repository.listReconciliationCandidates).toHaveBeenCalledWith(9);

      const response = await fetch(`${baseUrl}/tools/reconciliation/${executionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': 'corr-1' },
        body: JSON.stringify({ action: 'confirm', reason: 'Confirmado no sistema externo' }),
      });
      expect(response.status).toBe(200);
      expect(mocks.repository.reconcile).toHaveBeenCalledWith(
        executionId,
        'confirm',
        'manager-1',
        'Confirmado no sistema externo'
      );
      expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
        action: 'tool_reconcile_confirm',
        details: expect.objectContaining({ reasonHash: expect.any(String) }),
      }));
    });
  });

  it('rejects malformed decisions and denies agents without reconciliation permission', async () => {
    await withServer({ id: 'manager-1', role: 'manager' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/tools/reconciliation/${executionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', reason: 'x' }),
      });
      expect(response.status).toBe(400);
      expect(mocks.repository.reconcile).not.toHaveBeenCalled();
    });

    await withServer({ id: 'agent-1', role: 'agent' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/tools/reconciliation`);
      expect(response.status).toBe(403);
      expect(mocks.repository.listReconciliationCandidates).toHaveBeenCalledTimes(0);
    });
  });
});
