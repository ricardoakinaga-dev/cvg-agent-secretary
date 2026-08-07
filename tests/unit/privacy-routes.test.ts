import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { describe, expect, it, vi } from 'vitest';
import { createPrivacyRouter } from '../../src/modules/privacy/routes';
import { PrivacyLifecycleService, PrivacyOperationError } from '../../src/modules/privacy/service';

async function withServer(
  service: Pick<
    PrivacyLifecycleService,
    'previewRetention' | 'purgeRetention' | 'exportSubject' | 'anonymizeSubject' | 'eraseSubject'
  >,
  role: 'admin' | 'viewer' = 'admin',
  run: (url: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'signed-privacy-officer', role };
    next();
  });
  app.use(createPrivacyRouter(service, () => '42'));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function serviceMock() {
  return {
    previewRetention: vi.fn(),
    purgeRetention: vi.fn(),
    exportSubject: vi.fn(),
    anonymizeSubject: vi.fn(),
    eraseSubject: vi.fn(),
  };
}

const receipt = {
  id: 'receipt-1',
  operationId: 'receipt-1',
  tenantId: '42',
  idempotencyKey: 'privacy-request-0001',
  kind: 'subject_erase' as const,
  status: 'completed' as const,
  actorId: 'signed-privacy-officer',
  createdAt: '2026-08-02T12:00:00.000Z',
  scopeHash: 'a'.repeat(64),
  evidenceHash: 'b'.repeat(64),
  summary: { affected: 2 },
};

describe('privacy routes', () => {
  it('derives tenant and actor server-side for a retention preview', async () => {
    const service = serviceMock();
    service.previewRetention.mockResolvedValue({ receipt, results: [] });

    await withServer(service, 'admin', async (url) => {
      const response = await fetch(`${url}/retention/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: 'privacy-request-0001' }),
      });

      expect(response.status).toBe(200);
      expect(service.previewRetention).toHaveBeenCalledWith({
        tenantId: '42',
        actorId: 'signed-privacy-officer',
        idempotencyKey: 'privacy-request-0001',
      });
    });
  });

  it('requires admin deletion permission for destructive operations', async () => {
    const service = serviceMock();

    await withServer(service, 'viewer', async (url) => {
      const response = await fetch(
        `${url}/subjects/60f91d6d-f0c6-46b7-b8b4-621592d040fc/erase`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: 'privacy-erasure-0001',
            recoveryCheckpointId: 'backup-20260802-0001',
            confirm: true,
          }),
        }
      );

      expect(response.status).toBe(403);
      expect(service.eraseSubject).not.toHaveBeenCalled();
    });
  });

  it('uses the signed actor and rejects unconfirmed erasure', async () => {
    const service = serviceMock();

    await withServer(service, 'admin', async (url) => {
      const response = await fetch(
        `${url}/subjects/60f91d6d-f0c6-46b7-b8b4-621592d040fc/erase`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idempotencyKey: 'privacy-erasure-0001', confirm: false }),
        }
      );

      expect(response.status).toBe(400);
      expect(service.eraseSubject).not.toHaveBeenCalled();
    });
  });

  it('does not leak store errors through the HTTP response', async () => {
    const service = serviceMock();
    service.eraseSubject.mockRejectedValue(new PrivacyOperationError(
      'Privacy operation failed; no success receipt was issued',
      'PRIVACY_STORE_OPERATION_FAILED'
    ));

    await withServer(service, 'admin', async (url) => {
      const response = await fetch(
        `${url}/subjects/60f91d6d-f0c6-46b7-b8b4-621592d040fc/erase`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: 'privacy-erasure-0001',
            recoveryCheckpointId: 'backup-20260802-0001',
            confirm: true,
          }),
        }
      );
      const body = await response.json() as { error: string; code: string };

      expect(response.status).toBe(503);
      expect(body).toEqual({
        error: 'Privacy operation failed',
        code: 'PRIVACY_STORE_OPERATION_FAILED',
      });
      expect(JSON.stringify(body)).not.toContain('redis');
    });
  });
});
