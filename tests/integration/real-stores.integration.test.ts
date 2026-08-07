import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import pg from 'pg';

const runIntegration = process.env.RUN_STORE_INTEGRATION === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!runIntegration) {
    return value ?? 'integration-test-disabled';
  }
  if (!value) {
    throw new Error(`${name} is required for store integration tests`);
  }
  return value;
}

describeIntegration('real store integration', () => {
  const tenantId = requiredEnv('CHATWOOT_ACCOUNT_ID');
  const foreignTenantId = String(Number(tenantId) + 1);
  const appDatabaseUrl = requiredEnv('DATABASE_URL');
  const adminDatabaseUrl = requiredEnv('MIGRATION_DATABASE_URL');
  const redisUrl = requiredEnv('REDIS_URL');
  const redisUsername = requiredEnv('REDIS_USERNAME');
  const redisPassword = requiredEnv('REDIS_PASSWORD');
  const qdrantUrl = requiredEnv('QDRANT_URL').replace(/\/$/, '');
  const qdrantCollection = requiredEnv('QDRANT_COLLECTION');

  const adminPool = new pg.Pool({ connectionString: adminDatabaseUrl });
  const appPool = new pg.Pool({
    connectionString: appDatabaseUrl,
    options: `-c app.tenant_id=${tenantId}`,
  });
  const redis = new Redis(redisUrl, {
    username: redisUsername,
    password: redisPassword,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  afterAll(async () => {
    await adminPool.query('DELETE FROM contacts WHERE name LIKE $1', ['CI tenant isolation %']);
    if (redis.status !== 'end') {
      await redis.quit();
    }
    await appPool.end();
    await adminPool.end();
    await fetch(`${qdrantUrl}/collections/${qdrantCollection}`, { method: 'DELETE' });
  });

  it('runs the application role without superuser or schema creation privileges', async () => {
    const result = await appPool.query<{
      current_user: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      can_create_schema: boolean;
    }>(`
      SELECT current_user,
             role.rolsuper,
             role.rolcreatedb,
             has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema
      FROM pg_roles role
      WHERE role.rolname = current_user
    `);

    expect(result.rows).toEqual([
      expect.objectContaining({
        rolsuper: false,
        rolcreatedb: false,
        can_create_schema: false,
      }),
    ]);
    await expect(appPool.query('CREATE TABLE forbidden_runtime_ddl (id integer)')).rejects.toThrow();
  });

  it('enforces tenant RLS for reads and writes using the runtime role', async () => {
    await adminPool.query(
      'INSERT INTO contacts (tenant_id, name) VALUES ($1, $2), ($3, $4)',
      [tenantId, 'CI tenant isolation own', foreignTenantId, 'CI tenant isolation foreign']
    );

    const visible = await appPool.query<{ tenant_id: string; name: string }>(
      "SELECT tenant_id::text, name FROM contacts WHERE name LIKE 'CI tenant isolation %'"
    );
    expect(visible.rows).toEqual([
      { tenant_id: tenantId, name: 'CI tenant isolation own' },
    ]);

    await expect(
      appPool.query('INSERT INTO contacts (tenant_id, name) VALUES ($1, $2)', [
        foreignTenantId,
        'CI tenant isolation forbidden',
      ])
    ).rejects.toThrow(/row-level security/i);
  });

  it('persists contact PII as ciphertext and resolves normalized blind-index lookups', async () => {
    const { config } = await import('../../src/config');
    const originalPii = { ...config.pii };
    const dataKey = Buffer.alloc(32, 31).toString('base64');
    const lookupKey = Buffer.alloc(32, 32).toString('base64');
    config.pii.encryptionRequired = true;
    config.pii.activeKeyId = 'integration-2026';
    config.pii.encryptionKeysJson = JSON.stringify({ 'integration-2026': dataKey });
    config.pii.lookupKey = lookupKey;

    let contactId: string | undefined;
    try {
      const { ContactRepository } = await import('../../src/modules/contacts/repository');
      const repository = new ContactRepository();
      const created = await repository.create({
        name: 'CI PII Maria',
        email: 'CI.PII@Example.com',
        phone: '+55 (11) 98888-7777',
        cpf: '123.456.789-00',
        address: 'Rua de integração, 100',
      });
      contactId = created.id;

      const raw = await adminPool.query<{
        name: string;
        email: string | null;
        phone: string | null;
        cpf: string | null;
        address: string | null;
        pii_encrypted: Record<string, string>;
        email_lookup: string;
      }>('SELECT name, email, phone, cpf, address, pii_encrypted, email_lookup FROM contacts WHERE id = $1', [created.id]);

      expect(raw.rows[0]).toEqual(expect.objectContaining({
        name: expect.stringMatching(/^protected-/),
        email: null,
        phone: null,
        cpf: null,
        address: null,
        email_lookup: expect.stringMatching(/^[a-f0-9]{64}$/),
      }));
      expect(raw.rows[0].pii_encrypted.email).toMatch(/^encv1\.integration-2026\./);
      expect(JSON.stringify(raw.rows[0])).not.toContain('CI.PII@Example.com');
      expect(JSON.stringify(raw.rows[0])).not.toContain('123.456.789-00');

      const found = await repository.find({ email: '  ci.pii@example.COM ' });
      expect(found).toEqual(expect.objectContaining({
        id: created.id,
        name: 'CI PII Maria',
        email: 'CI.PII@Example.com',
      }));
    } finally {
      if (contactId) await adminPool.query('DELETE FROM contacts WHERE id = $1', [contactId]);
      Object.assign(config.pii, originalPii);
    }
  });

  it('uses authenticated Redis ACLs and executes atomic queue lease recovery', async () => {
    await redis.connect();
    expect(await redis.ping()).toBe('PONG');
    await expect(redis.set('outside-approved-namespace', 'forbidden')).rejects.toThrow(/NOPERM/i);

    const { redisClient } = await import('../../src/shared/redis');
    await redisClient.connect();
    const jobId = randomUUID();
    const deliveryId = 'a'.repeat(64);
    const serializedJob = JSON.stringify({ id: jobId, payload: { content: 'minimum-dto' } });

    expect(await redisClient.enqueueChatwootWebhookOnce(serializedJob, deliveryId, 60)).toBe(true);
    expect(await redisClient.enqueueChatwootWebhookOnce(serializedJob, deliveryId, 60)).toBe(false);
    expect(await redisClient.claimChatwootWebhook('worker-a', 100, 1_000)).toBe(serializedJob);
    expect(await redisClient.recoverExpiredChatwootWebhooks(1_099)).toBe(0);
    expect(await redisClient.recoverExpiredChatwootWebhooks(1_100)).toBe(1);
    expect(await redisClient.claimChatwootWebhook('worker-b', 100, 1_101)).toBe(serializedJob);
    await redisClient.acknowledgeChatwootWebhook(jobId, 'worker-b');
    await redisClient.disconnect();
  });

  it('filters and deletes Qdrant points by tenant', async () => {
    const { QdrantHybridStore } = await import('../../src/modules/knowledge/qdrant-store');
    const store = new QdrantHybridStore();
    await store.initialize();

    const ownPointId = randomUUID();
    const foreignPointId = randomUUID();
    const vector = Array.from({ length: 1536 }, (_, index) => index === 0 ? 1 : 0);
    await store.addChunks([{
      id: ownPointId,
      documentId: 'shared-document-id',
      chunkIndex: 0,
      content: 'horario atendimento hospital veterinario',
      title: 'Own tenant',
      category: 'faq',
      tags: ['ci'],
      version: 1,
      source: 'manual',
      relevance: 1,
      isActive: true,
      embedding: vector,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);
    await fetch(`${qdrantUrl}/collections/${qdrantCollection}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{
          id: foreignPointId,
          vector: { dense: vector, sparse: { indices: [1], values: [1] } },
          payload: {
            tenant_id: foreignTenantId,
            document_id: 'shared-document-id',
            text: 'foreign tenant must remain invisible',
            title: 'Foreign tenant',
            category: 'faq',
          },
        }],
      }),
    }).then((response) => {
      if (!response.ok) throw new Error(`Unable to seed Qdrant (${response.status})`);
    });

    const results = await store.search('horario atendimento', vector, {
      limit: 10,
      minRelevance: 0,
    });
    expect(results.map((result) => result.chunk.id)).toEqual([ownPointId]);

    await store.deleteByDocument('shared-document-id');
    const remaining = await fetch(
      `${qdrantUrl}/collections/${qdrantCollection}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ with_payload: true, with_vector: false, limit: 10 }),
      }
    ).then((response) => response.json()) as {
      result: { points: Array<{ id: string; payload: { tenant_id: string } }> };
    };
    expect(remaining.result.points).toEqual([
      expect.objectContaining({
        id: foreignPointId,
        payload: expect.objectContaining({ tenant_id: foreignTenantId }),
      }),
    ]);
  });
});
