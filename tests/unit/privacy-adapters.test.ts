import { describe, expect, it, vi } from 'vitest';
import {
  AttestedNoPersonalDataAdapter,
  DelegatedPrivacyStoreAdapter,
  PostgresPrivacyStoreAdapter,
  PrivacyQueryClient,
} from '../../src/modules/privacy/adapters';
import { RetentionStoreContext, SubjectStoreContext } from '../../src/modules/privacy/types';

function queryClient(): PrivacyQueryClient {
  return {
    query: vi.fn(async (sql: string) => ({
      rows: sql.includes('COUNT') ? [{ matched: '2' }] : [],
      rowCount: 1,
    })),
  };
}

const retentionContext: RetentionStoreContext = {
  operationId: 'operation-1',
  tenantId: '42',
  actorId: 'privacy-officer',
  operation: 'retention_preview',
  policyId: 'messages-30d',
  resource: 'messages',
  cutoff: new Date('2026-07-01T00:00:00.000Z'),
  batchSize: 100,
};

const subjectContext: SubjectStoreContext = {
  operationId: 'operation-2',
  tenantId: '42',
  actorId: 'privacy-officer',
  operation: 'subject_erase',
  contactId: '60f91d6d-f0c6-46b7-b8b4-621592d040fc',
};

describe('privacy store adapters', () => {
  it('uses a resource allowlist and parameterized tenant/cutoff values for retention', async () => {
    const client = queryClient();
    const adapter = new PostgresPrivacyStoreAdapter({
      withClient: async (work) => work(client),
      withTransaction: async (work) => work(client),
    });

    const result = await adapter.previewRetention(retentionContext);

    expect(result).toEqual({ matched: 2 });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_id = $1 AND created_at < $2'),
      ['42', retentionContext.cutoff, 100]
    );
    expect(String(vi.mocked(client.query).mock.calls[0][0])).not.toContain('42');
  });

  it('rejects unknown retention resources instead of interpolating them into SQL', async () => {
    const client = queryClient();
    const adapter = new PostgresPrivacyStoreAdapter({
      withClient: async (work) => work(client),
      withTransaction: async (work) => work(client),
    });

    await expect(adapter.purgeRetention({
      ...retentionContext,
      operation: 'retention_purge',
      resource: 'messages; DROP TABLE contacts',
    })).rejects.toThrow('Unsupported Postgres retention resource');
    expect(client.query).not.toHaveBeenCalled();
  });

  it('purges composite-key retention resources without assuming an id column', async () => {
    const client = queryClient();
    const adapter = new PostgresPrivacyStoreAdapter({
      withClient: async (work) => work(client),
      withTransaction: async (work) => work(client),
    });

    await adapter.purgeRetention({
      ...retentionContext,
      operation: 'retention_purge',
      resource: 'conversation_control_state',
    });

    const sql = String(vi.mocked(client.query).mock.calls[0][0]);
    expect(sql).toContain('WHERE (tenant_id, conversation_id) IN');
    expect(sql).toContain('SELECT tenant_id, conversation_id FROM conversation_control_state');
    expect(sql).not.toContain('WHERE (id) IN');
  });

  it('includes durable scheduling state in the privacy retention allowlist', async () => {
    const client = queryClient();
    const adapter = new PostgresPrivacyStoreAdapter({
      withClient: async (work) => work(client),
      withTransaction: async (work) => work(client),
    });

    await adapter.previewRetention({
      ...retentionContext,
      resource: 'scheduling_state',
    });

    expect(String(vi.mocked(client.query).mock.calls[0][0]))
      .toContain('FROM conversation_scheduling_state');
  });

  it('keeps subject export queries tenant-scoped', async () => {
    const client = queryClient();
    const adapter = new PostgresPrivacyStoreAdapter({
      withClient: async (work) => work(client),
      withTransaction: async (work) => work(client),
    });

    await adapter.exportSubject(subjectContext);

    const calls = vi.mocked(client.query).mock.calls;
    expect(calls.length).toBeGreaterThan(5);
    for (const call of calls) {
      expect(call[1]?.[0]).toBe('42');
    }
  });

  it('runs Postgres erasure atomically through the injected transaction boundary', async () => {
    const client = queryClient();
    const transactionCalled = vi.fn();
    const adapter = new PostgresPrivacyStoreAdapter({
      withClient: async (work) => work(client),
      async withTransaction<T>(work: (transaction: PrivacyQueryClient) => Promise<T>): Promise<T> {
        transactionCalled();
        return work(client);
      },
    });

    const result = await adapter.eraseSubject(subjectContext);

    expect(transactionCalled).toHaveBeenCalledOnce();
    expect(result.affected).toBeGreaterThan(0);
    for (const call of vi.mocked(client.query).mock.calls) {
      expect(call[1]?.[0]).toBe('42');
    }
  });

  it('destroys encrypted PII and blind indexes during subject anonymization', async () => {
    const client = queryClient();
    const adapter = new PostgresPrivacyStoreAdapter({
      withClient: async (work) => work(client),
      withTransaction: async (work) => work(client),
    });

    await adapter.anonymizeSubject({ ...subjectContext, operation: 'subject_anonymize' });

    const contactMutation = vi.mocked(client.query).mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('UPDATE contacts SET'));
    expect(contactMutation).toContain("pii_encrypted = '{}'::JSONB");
    expect(contactMutation).toContain('email_lookup = NULL');
    expect(contactMutation).toContain('cpf_lookup = NULL');
    const conversationMutation = vi.mocked(client.query).mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('UPDATE conversations SET'));
    expect(conversationMutation).toContain("contact_intake = '{}'::JSONB");
  });

  it('requires every delegated capability and preserves the declared store name', async () => {
    expect(() => new DelegatedPrivacyStoreAdapter('redis', {} as never))
      .toThrow('Incomplete privacy adapter delegation');

    const adapter = new DelegatedPrivacyStoreAdapter('redis', {
      preflight: vi.fn(async () => undefined),
      previewRetention: vi.fn(async () => ({ matched: 0 })),
      purgeRetention: vi.fn(async () => ({ affected: 0 })),
      exportSubject: vi.fn(async () => ({})),
      anonymizeSubject: vi.fn(async () => ({ affected: 0 })),
      eraseSubject: vi.fn(async () => ({ affected: 0 })),
    });
    expect(adapter.name).toBe('redis');
  });

  it('allows a no-data adapter only with an explicit inventory attestation', async () => {
    expect(() => new AttestedNoPersonalDataAdapter('logs', ''))
      .toThrow('A data inventory attestation is required');

    const adapter = new AttestedNoPersonalDataAdapter('logs', 'INV-LOG-2026-08');
    expect(await adapter.exportSubject(subjectContext)).toEqual({
      applicable: false,
      attestationId: 'INV-LOG-2026-08',
    });
  });
});
