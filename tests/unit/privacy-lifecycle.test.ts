import { describe, expect, it, vi } from 'vitest';
import {
  PrivacyAuditAdapter,
  PrivacyOperationReceipt,
  PrivacyStoreAdapter,
  StoreName,
} from '../../src/modules/privacy/types';
import {
  PrivacyLifecycleService,
  PrivacyOperationError,
} from '../../src/modules/privacy/service';

const STORES: StoreName[] = ['postgres', 'redis', 'qdrant', 'logs'];

function store(name: StoreName): PrivacyStoreAdapter {
  return {
    name,
    preflight: vi.fn(async () => undefined),
    previewRetention: vi.fn(async () => ({ matched: name === 'postgres' ? 3 : 0 })),
    purgeRetention: vi.fn(async () => ({ affected: name === 'postgres' ? 3 : 0 })),
    exportSubject: vi.fn(async () => ({ store: name, records: name === 'postgres' ? 2 : 0 })),
    anonymizeSubject: vi.fn(async () => ({ affected: 1 })),
    eraseSubject: vi.fn(async () => ({ affected: 1 })),
  };
}

function fixture() {
  const stores = Object.fromEntries(STORES.map((name) => [name, store(name)])) as Record<
    StoreName,
    PrivacyStoreAdapter
  >;
  const receipts = new Map<string, PrivacyOperationReceipt>();
  let sequence = 0;
  const audit: PrivacyAuditAdapter = {
    findCompleted: vi.fn(async (tenantId, idempotencyKey) =>
      receipts.get(`${tenantId}:${idempotencyKey}`)),
    findById: vi.fn(async (_tenantId, receiptId) =>
      Array.from(receipts.values()).find((receipt) => receipt.id === receiptId)),
    begin: vi.fn(async () => ({ operationId: `operation-${++sequence}` })),
    complete: vi.fn(async (receipt) => {
      receipts.set(`${receipt.tenantId}:${receipt.idempotencyKey}`, receipt);
      return receipt;
    }),
    fail: vi.fn(async () => undefined),
  };
  const recovery = { verifyCheckpoint: vi.fn(async () => true) };
  const service = new PrivacyLifecycleService({
    stores,
    audit,
    recovery,
    policies: [
      {
        id: 'conversation-messages',
        store: 'postgres',
        resource: 'messages',
        retentionDays: 30,
        batchSize: 500,
      },
    ],
    now: () => new Date('2026-08-02T12:00:00.000Z'),
  });

  return { service, stores, audit, recovery, receipts };
}

const base = {
  tenantId: '42',
  actorId: 'privacy-officer-1',
  idempotencyKey: 'privacy-request-0001',
};

describe('PrivacyLifecycleService', () => {
  it('creates a tenant-scoped, auditable retention dry-run', async () => {
    const { service, stores, audit } = fixture();

    const result = await service.previewRetention(base);

    expect(stores.postgres.previewRetention).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: '42',
      resource: 'messages',
      cutoff: new Date('2026-07-03T12:00:00.000Z'),
      batchSize: 500,
    }));
    expect(result.receipt.kind).toBe('retention_preview');
    expect(result.receipt.status).toBe('completed');
    expect(result.receipt.evidenceHash).toMatch(/^[a-f\d]{64}$/);
    expect(result.results).toEqual([
      expect.objectContaining({ policyId: 'conversation-messages', matched: 3 }),
    ]);
    expect(audit.complete).toHaveBeenCalledOnce();
  });

  it('refuses purge without an approved dry-run receipt', async () => {
    const { service, stores } = fixture();

    await expect(service.purgeRetention({
      ...base,
      idempotencyKey: 'privacy-purge-0001',
      approvedPreviewReceiptId: 'receipt-that-does-not-exist',
      recoveryCheckpointId: 'backup-20260802-0001',
      confirm: true,
    })).rejects.toThrow('A completed retention preview receipt is required');
    expect(stores.postgres.purgeRetention).not.toHaveBeenCalled();
  });

  it('purges only after a same-tenant dry-run and preflights every participating store', async () => {
    const { service, stores } = fixture();
    const preview = await service.previewRetention(base);

    const result = await service.purgeRetention({
      ...base,
      idempotencyKey: 'privacy-purge-0001',
      approvedPreviewReceiptId: preview.receipt.id,
      recoveryCheckpointId: 'backup-20260802-0001',
      confirm: true,
    });

    expect(stores.postgres.preflight).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: '42',
      operation: 'retention_purge',
    }));
    expect(stores.postgres.purgeRetention).toHaveBeenCalledOnce();
    expect(result.receipt.kind).toBe('retention_purge');
  });

  it('fails closed when the recovery checkpoint cannot be verified', async () => {
    const { service, stores, recovery } = fixture();
    const preview = await service.previewRetention(base);
    recovery.verifyCheckpoint.mockResolvedValueOnce(false);

    await expect(service.purgeRetention({
      ...base,
      idempotencyKey: 'privacy-purge-0002',
      approvedPreviewReceiptId: preview.receipt.id,
      recoveryCheckpointId: 'backup-20260802-0001',
      confirm: true,
    })).rejects.toMatchObject({ code: 'PRIVACY_RECOVERY_CHECKPOINT_INVALID' });
    expect(stores.postgres.purgeRetention).not.toHaveBeenCalled();
  });

  it('exports a subject from every applicable store without putting payload data in the receipt', async () => {
    const { service, stores, audit } = fixture();

    const result = await service.exportSubject({
      ...base,
      contactId: '60f91d6d-f0c6-46b7-b8b4-621592d040fc',
    });

    expect(Object.keys(result.data)).toEqual(STORES);
    for (const adapter of Object.values(stores)) {
      expect(adapter.exportSubject).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: '42',
        contactId: '60f91d6d-f0c6-46b7-b8b4-621592d040fc',
      }));
    }
    expect(JSON.stringify(result.receipt)).not.toContain('60f91d6d-f0c6-46b7-b8b4-621592d040fc');
    expect(audit.complete).toHaveBeenCalledOnce();
  });

  it('is idempotent for destructive subject operations', async () => {
    const { service, stores } = fixture();
    const request = {
      ...base,
      idempotencyKey: 'privacy-erasure-0001',
      contactId: '60f91d6d-f0c6-46b7-b8b4-621592d040fc',
      confirm: true as const,
      recoveryCheckpointId: 'backup-20260802-0001',
    };

    const first = await service.eraseSubject(request);
    const second = await service.eraseSubject(request);

    expect(second.receipt).toEqual(first.receipt);
    for (const adapter of Object.values(stores)) {
      expect(adapter.eraseSubject).toHaveBeenCalledOnce();
    }
  });

  it('fails closed, records a sanitized failure and never runs later stores', async () => {
    const { service, stores, audit } = fixture();
    vi.mocked(stores.redis.eraseSubject).mockRejectedValueOnce(new Error('redis://secret@host'));

    await expect(service.eraseSubject({
      ...base,
      contactId: '60f91d6d-f0c6-46b7-b8b4-621592d040fc',
      confirm: true,
      recoveryCheckpointId: 'backup-20260802-0001',
    })).rejects.toBeInstanceOf(PrivacyOperationError);

    expect(stores.qdrant.eraseSubject).not.toHaveBeenCalled();
    expect(audit.fail).toHaveBeenCalledWith(expect.objectContaining({
      code: 'PRIVACY_STORE_OPERATION_FAILED',
      completedStores: ['postgres'],
    }));
    expect(JSON.stringify(vi.mocked(audit.fail).mock.calls)).not.toContain('secret');
  });

  it('rejects invalid tenant identifiers before touching a store', async () => {
    const { service, stores } = fixture();

    await expect(service.previewRetention({ ...base, tenantId: '../other-tenant' }))
      .rejects.toThrow('Invalid privacy operation request');
    expect(stores.postgres.previewRetention).not.toHaveBeenCalled();
  });

  it('sanitizes an audit claim failure before any store is touched', async () => {
    const { service, stores, audit } = fixture();
    vi.mocked(audit.begin).mockRejectedValueOnce(new Error('postgres://secret@audit-host'));

    await expect(service.previewRetention(base)).rejects.toMatchObject({
      code: 'PRIVACY_OPERATION_BUSY',
      message: 'Privacy operation could not be claimed',
    });
    expect(stores.postgres.previewRetention).not.toHaveBeenCalled();
  });
});
