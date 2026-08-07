import { config } from '../../src/config';
import {
  ConfiguredPrivacyRecoveryAdapter,
  RedisPrivacyStoreAdapter,
} from '../../src/modules/privacy/runtime-adapters';
import { createPrivacyRuntime } from '../../src/modules/privacy/runtime';
import type { PostgresPrivacyGateway } from '../../src/modules/privacy/adapters';

const contactId = '60f91d6d-f0c6-46b7-b8b4-621592d040fc';

function gateway(): PostgresPrivacyGateway {
  const client = {
    query: vi.fn(async () => ({
      rows: [{ identifier: '77' }, { identifier: '88' }],
      rowCount: 2,
    })),
  };
  return {
    withClient: async (work) => work(client),
    withTransaction: async (work) => work(client),
  };
}

function redisFixture() {
  const types = new Map([
    ['cvg:1:string', 'string'],
    ['cvg:1:list', 'list'],
    ['cvg:1:hash', 'hash'],
    ['cvg:1:set', 'set'],
    ['cvg:1:zset', 'zset'],
  ]);
  const transaction = {
    del: vi.fn(),
    lrem: vi.fn(),
    hdel: vi.fn(),
    srem: vi.fn(),
    zrem: vi.fn(),
    exec: vi.fn(async () => []),
  };
  const redis = {
    ping: vi.fn(async () => 'PONG'),
    zcount: vi.fn(async () => 12),
    zrangebyscore: vi.fn(async () => ['old-one', 'old-two']),
    zrem: vi.fn(async () => 2),
    scan: vi.fn(async () => ['0', [...types.keys()]]),
    type: vi.fn(async (key: string) => types.get(key) || 'none'),
    get: vi.fn(async () => JSON.stringify({ contactId })),
    lrange: vi.fn(async () => [JSON.stringify({ sender: { id: 77 } }), '{"other":true}']),
    hgetall: vi.fn(async () => ({ job: JSON.stringify({ conversation: { id: 88 } }) })),
    smembers: vi.fn(async () => ['not-a-subject']),
    zrange: vi.fn(async () => [JSON.stringify({ contact_id: contactId })]),
    multi: vi.fn(() => transaction),
  };
  return { redis, transaction };
}

describe('privacy runtime adapters', () => {
  it('verifies only attested checkpoints from the same tenant and before the operation', async () => {
    const recovery = new ConfiguredPrivacyRecoveryAdapter(JSON.stringify([{
      id: 'backup-20260802-0001',
      tenantId: '1',
      createdAt: '2026-08-02T10:00:00.000Z',
      verified: true,
    }]));

    await expect(recovery.verifyCheckpoint({
      tenantId: '1',
      checkpointId: 'backup-20260802-0001',
      createdBefore: new Date('2026-08-02T11:00:00.000Z'),
    })).resolves.toBe(true);
    await expect(recovery.verifyCheckpoint({
      tenantId: '2',
      checkpointId: 'backup-20260802-0001',
      createdBefore: new Date('2026-08-02T11:00:00.000Z'),
    })).resolves.toBe(false);
    expect(() => new ConfiguredPrivacyRecoveryAdapter('{broken')).toThrow(/invalid JSON/);
    expect(() => new ConfiguredPrivacyRecoveryAdapter('[]')).not.toThrow();
  });

  it('preflights Redis and applies bounded DLQ retention by score', async () => {
    const { redis } = redisFixture();
    const adapter = new RedisPrivacyStoreAdapter(() => redis as never, gateway());
    const base = {
      operationId: 'operation-1',
      tenantId: '1',
      actorId: 'privacy-admin',
      operation: 'retention_purge' as const,
      policyId: 'redis-dlq',
      resource: 'webhook_dlq',
      cutoff: new Date('2026-08-01T00:00:00.000Z'),
      batchSize: 5,
    };

    await expect(adapter.preflight(base)).resolves.toBeUndefined();
    await expect(adapter.previewRetention(base)).resolves.toEqual({ matched: 5 });
    await expect(adapter.purgeRetention(base)).resolves.toEqual({ affected: 2 });
    expect(redis.zrangebyscore).toHaveBeenCalledWith(
      'cvg:1:queue:chatwoot:webhooks:failed',
      '-inf',
      base.cutoff.getTime(),
      'LIMIT',
      0,
      5
    );
    await expect(adapter.previewRetention({ ...base, resource: 'arbitrary-key' }))
      .rejects.toThrow(/Unsupported Redis retention resource/);
    await expect(adapter.preflight({ ...base, tenantId: '2' }))
      .rejects.toThrow(/configured account/);
  });

  it('finds exact subject identifiers across Redis data types and removes only matches', async () => {
    const { redis, transaction } = redisFixture();
    const adapter = new RedisPrivacyStoreAdapter(() => redis as never, gateway());
    const context = {
      operationId: 'operation-2',
      tenantId: '1',
      actorId: 'privacy-admin',
      operation: 'subject_erase' as const,
      contactId,
    };

    const exported = await adapter.exportSubject(context) as { entries: unknown[] };
    expect(exported.entries).toHaveLength(4);
    await expect(adapter.eraseSubject(context)).resolves.toEqual({ affected: 4 });
    expect(transaction.del).toHaveBeenCalledWith('cvg:1:string');
    expect(transaction.lrem).toHaveBeenCalledWith(
      'cvg:1:list',
      0,
      JSON.stringify({ sender: { id: 77 } })
    );
    expect(transaction.hdel).toHaveBeenCalledWith('cvg:1:hash', 'job');
    expect(transaction.zrem).toHaveBeenCalledWith(
      'cvg:1:zset',
      JSON.stringify({ contact_id: contactId })
    );
  });

  it('builds the privacy router only from a complete, approved-shaped configuration', () => {
    const original = { ...config.privacy };
    try {
      config.privacy.retentionPoliciesJson = JSON.stringify([{
        id: 'messages-approved-v1',
        store: 'postgres',
        resource: 'messages',
        retentionDays: 30,
        batchSize: 100,
      }]);
      config.privacy.recoveryCheckpointsJson = JSON.stringify([{
        id: 'backup-20260802-0001',
        tenantId: '1',
        createdAt: '2026-08-02T10:00:00.000Z',
        verified: true,
      }]);
      config.privacy.qdrantAttestationId = 'inventory-qdrant-v1';
      config.privacy.logsAttestationId = 'inventory-logs-v1';

      expect(createPrivacyRuntime()).toBeTypeOf('function');
      config.privacy.retentionPoliciesJson = '[]';
      expect(() => createPrivacyRuntime()).toThrow();
    } finally {
      Object.assign(config.privacy, original);
    }
  });
});
