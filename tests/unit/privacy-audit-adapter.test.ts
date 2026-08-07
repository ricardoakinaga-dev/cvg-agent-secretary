import { describe, expect, it, vi } from 'vitest';
import { PostgresPrivacyAuditAdapter } from '../../src/modules/privacy/audit-adapter';
import { PrivacyOperationReceipt } from '../../src/modules/privacy/types';
import { PrivacyQueryClient } from '../../src/modules/privacy/adapters';
import { privacyDigest } from '../../src/modules/privacy/evidence';

const receiptBase: Omit<PrivacyOperationReceipt, 'evidenceHash'> = {
  id: 'b438454d-a09c-4303-99de-b5bfadbf3a19',
  operationId: 'b438454d-a09c-4303-99de-b5bfadbf3a19',
  tenantId: '42',
  idempotencyKey: 'privacy-erasure-0001',
  kind: 'subject_erase',
  status: 'completed',
  actorId: 'privacy-officer',
  createdAt: '2026-08-02T12:00:00.000Z',
  scopeHash: 'a'.repeat(64),
  summary: { affected: 12, stores: 4 },
};
const receipt: PrivacyOperationReceipt = {
  ...receiptBase,
  evidenceHash: privacyDigest(receiptBase),
};

function client(rows: Record<string, unknown>[] = []): PrivacyQueryClient {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  };
}

describe('PostgresPrivacyAuditAdapter', () => {
  it('claims an idempotency key under a transaction-scoped advisory lock', async () => {
    const db = client();
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: receipt.id }], rowCount: 1 });
    const adapter = new PostgresPrivacyAuditAdapter({
      withClient: async (work) => work(db),
      withTransaction: async (work) => work(db),
    });

    const started = await adapter.begin({
      tenantId: '42',
      actorId: 'privacy-officer',
      idempotencyKey: 'privacy-erasure-0001',
      kind: 'subject_erase',
      scopeHash: 'a'.repeat(64),
      startedAt: '2026-08-02T12:00:00.000Z',
    });

    expect(started.operationId).toBe(receipt.id);
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('pg_advisory_xact_lock'), [
      expect.stringMatching(/^[a-f\d]{64}$/),
    ]);
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("action IN ('started', 'completed')"),
      ['42', expect.stringMatching(/^[a-f\d]{64}$/)]
    );
  });

  it('fails closed when the operation key is already in progress', async () => {
    const db = client();
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'existing' }], rowCount: 1 });
    const adapter = new PostgresPrivacyAuditAdapter({
      withClient: async (work) => work(db),
      withTransaction: async (work) => work(db),
    });

    await expect(adapter.begin({
      tenantId: '42',
      actorId: 'privacy-officer',
      idempotencyKey: 'privacy-erasure-0001',
      kind: 'subject_erase',
      scopeHash: 'a'.repeat(64),
      startedAt: '2026-08-02T12:00:00.000Z',
    })).rejects.toThrow('Privacy operation is already in progress');
  });

  it('reads only a valid completed receipt for the same tenant', async () => {
    const db = client([{ details: { receipt } }]);
    const adapter = new PostgresPrivacyAuditAdapter({
      withClient: async (work) => work(db),
      withTransaction: async (work) => work(db),
    });

    await expect(adapter.findCompleted('42', 'privacy-erasure-0001')).resolves.toEqual(receipt);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('tenant_id = $1'), [
      '42',
      'privacy-erasure-0001',
    ]);
  });

  it('writes the completion receipt without a raw subject identifier', async () => {
    const db = client();
    const adapter = new PostgresPrivacyAuditAdapter({
      withClient: async (work) => work(db),
      withTransaction: async (work) => work(db),
    });

    await adapter.complete(receipt);

    const parameters = vi.mocked(db.query).mock.calls[0][1] as unknown[];
    expect(parameters[0]).toBe('42');
    expect(JSON.stringify(parameters)).not.toContain('60f91d6d-f0c6-46b7-b8b4-621592d040fc');
  });

  it('rejects a receipt whose evidence hash no longer matches its contents', async () => {
    const tampered = { ...receipt, summary: { affected: 999, stores: 4 } };
    const db = client([{ details: { receipt: tampered } }]);
    const adapter = new PostgresPrivacyAuditAdapter({
      withClient: async (work) => work(db),
      withTransaction: async (work) => work(db),
    });

    await expect(adapter.findCompleted('42', 'privacy-erasure-0001')).resolves.toBeUndefined();
  });
});
