import express, { NextFunction, Request, Response as ExpressResponse } from 'express';
import http from 'http';
import { AddressInfo } from 'net';

const mocks = vi.hoisted(() => ({
  repository: {
    findUnknown: vi.fn(),
    getById: vi.fn(),
    markReconciled: vi.fn(),
  },
  chatwoot: {
    findMessageById: vi.fn(),
  },
  audit: vi.fn(),
}));

vi.mock('../../src/modules/runtime/responseOutboxRepository', () => ({
  responseOutboxRepository: mocks.repository,
}));
vi.mock('../../src/modules/chatwoot/client', () => ({ chatwootClient: mocks.chatwoot }));
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
import { config } from '../../src/config';
import { responseAdminRouter } from '../../src/modules/runtime/responseAdminRoutes';

const responseId = '11111111-1111-4111-8111-111111111111';

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
  application.use('/responses', responseAdminRouter);
  const server = http.createServer(application);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function intent() {
  return {
    id: responseId,
    conversationId: '22222222-2222-4222-8222-222222222222',
    chatwootConversationId: 123,
    inboundChatwootMessageId: 10,
    idempotencyKey: 'cvg:1:123:10',
    content: 'Resposta de teste',
    status: 'unknown',
    attempts: 1,
    lastError: 'timeout',
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    chatwootMessageId: null,
  };
}

describe('response outbox reconciliation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.findUnknown.mockResolvedValue([intent()]);
    mocks.repository.getById.mockResolvedValue(intent());
    mocks.chatwoot.findMessageById.mockResolvedValue({
      id: 501,
      content: 'Resposta de teste',
      message_type: 'outgoing',
    });
    mocks.repository.markReconciled.mockResolvedValue({
      ...intent(),
      status: 'reconciled',
      chatwootMessageId: 501,
    });
    mocks.audit.mockResolvedValue(undefined);
  });

  it('lists unknown intents and confirms only a matching Chatwoot message', async () => {
    await withServer({ id: 'manager-1', role: 'manager' }, async (baseUrl) => {
      const list = await fetch(`${baseUrl}/responses/reconciliation?limit=7`);
      expect(list.status).toBe(200);
      expect(mocks.repository.findUnknown).toHaveBeenCalledWith(7);

      const response = await fetch(`${baseUrl}/responses/reconciliation/${responseId}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': 'corr-1' },
        body: JSON.stringify({ chatwootMessageId: 501, reason: 'Confirmado no Chatwoot' }),
      });
      expect(response.status).toBe(200);
      expect(mocks.chatwoot.findMessageById).toHaveBeenCalledWith(123, 501);
      expect(mocks.repository.markReconciled).toHaveBeenCalledWith(responseId, 501, 'operator:manager-1');
      expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
        action: 'response_reconcile_confirm',
        details: expect.objectContaining({ reasonHash: expect.any(String) }),
      }));
    });
  });

  it('denies agents and rejects a mismatched external message', async () => {
    await withServer({ id: 'agent-1', role: 'agent' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/responses/reconciliation`);
      expect(response.status).toBe(403);
      expect(mocks.repository.findUnknown).not.toHaveBeenCalled();
    });

    mocks.chatwoot.findMessageById.mockResolvedValue({ id: 502, content: 'Outra resposta' });
    await withServer({ id: 'manager-1', role: 'manager' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/responses/reconciliation/${responseId}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatwootMessageId: 502, reason: 'Mensagem divergente' }),
      });
      expect(response.status).toBe(409);
      expect(mocks.repository.markReconciled).not.toHaveBeenCalled();
    });
  });

  it('rejects an incoming or private message even when its content matches', async () => {
    mocks.chatwoot.findMessageById.mockResolvedValue({
      id: 503,
      content: 'Resposta de teste',
      message_type: 'incoming',
      private: false,
    });

    await withServer({ id: 'manager-1', role: 'manager' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/responses/reconciliation/${responseId}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatwootMessageId: 503, reason: 'Validar mensagem' }),
      });
      expect(response.status).toBe(409);
      expect(mocks.repository.markReconciled).not.toHaveBeenCalled();
    });
  });

  it('rejects content-only manual confirmation when the compatibility fallback is disabled', async () => {
    const original = config.chatwoot.allowContentReconciliationFallback;
    config.chatwoot.allowContentReconciliationFallback = false;
    mocks.chatwoot.findMessageById.mockResolvedValue({
      id: 504,
      content: 'Resposta de teste',
      message_type: 'outgoing',
      private: false,
    });

    try {
      await withServer({ id: 'manager-1', role: 'manager' }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/responses/reconciliation/${responseId}/confirm`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chatwootMessageId: 504, reason: 'Sem marcador' }),
        });
        expect(response.status).toBe(409);
        expect(mocks.repository.markReconciled).not.toHaveBeenCalled();
      });
    } finally {
      config.chatwoot.allowContentReconciliationFallback = original;
    }
  });
});
