import { AppConfig, config, validateConfig } from '../../src/config';

function snapshotConfig(): AppConfig {
  return structuredClone(config);
}

function restoreConfig(snapshot: AppConfig): void {
  Object.assign(config, snapshot);
  Object.assign(config.database, snapshot.database);
  Object.assign(config.redis, snapshot.redis);
  Object.assign(config.knowledge, snapshot.knowledge);
  Object.assign(config.qdrant, snapshot.qdrant);
  Object.assign(config.openai, snapshot.openai);
  Object.assign(config.openrouter ?? {}, snapshot.openrouter ?? {});
  Object.assign(config.chatwoot, snapshot.chatwoot);
  Object.assign(config.auth, snapshot.auth);
  Object.assign(config.conversation, snapshot.conversation);
  Object.assign(config.logging, snapshot.logging);
}

describe('configuration validation', () => {
  const original = snapshotConfig();

  afterEach(() => {
    restoreConfig(original);
  });

  it.each([
    ['PORT', () => { config.port = Number.NaN; }, 'PORT must be an integer between 1 and 65535'],
    ['TRUST_PROXY_HOPS', () => { config.trustProxyHops = 11; }, 'TRUST_PROXY_HOPS must be an integer between 0 and 10'],
    ['DB_MAX_CONNECTIONS', () => { config.database.maxConnections = 0; }, 'DB_MAX_CONNECTIONS must be an integer between 1 and 100'],
    ['OPENAI_MAX_TOKENS', () => { config.openai.maxTokens = 0; }, 'OPENAI_MAX_TOKENS must be an integer between 1 and 32768'],
    ['OPENAI_TEMPERATURE', () => { config.openai.temperature = 3; }, 'OPENAI_TEMPERATURE must be between 0 and 2'],
    ['QDRANT_PREFETCH_LIMIT', () => { config.qdrant.prefetchLimit = -1; }, 'QDRANT_PREFETCH_LIMIT must be an integer between 1 and 1000'],
    ['QDRANT_SCORE_THRESHOLD', () => { config.qdrant.scoreThreshold = Number.NaN; }, 'QDRANT_SCORE_THRESHOLD must be between 0 and 1'],
  ])('rejects an invalid %s value', (_key, mutate, expectedError) => {
    mutate();

    expect(validateConfig().errors).toContain(expectedError);
  });

  it('rejects an unsupported AI provider even if environment parsing was bypassed', () => {
    config.aiProvider = 'unsupported' as AppConfig['aiProvider'];

    expect(validateConfig().errors).toContain('AI_PROVIDER must be openai, openrouter or auto');
  });

  it('requires an OpenRouter key and model when OpenRouter is the selected provider', () => {
    config.aiProvider = 'openrouter';
    config.openrouter = { apiKey: '', model: '' };

    const result = validateConfig();

    expect(result.errors).toContain('OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter');
    expect(result.errors).toContain('OPENROUTER_MODEL is required when AI_PROVIDER=openrouter');
  });

  it('requires a Qdrant URL and safe production credentials when Qdrant is active', () => {
    config.knowledge.vectorStore = 'qdrant';
    config.qdrant.url = 'http://qdrant.internal:6333';
    config.qdrant.apiKey = '';
    config.isProduction = true;
    config.chatwoot.webhookSecret = 'configured';
    config.auth.apiToken = 'configured';

    const result = validateConfig();

    expect(result.errors).toContain('QDRANT_API_KEY is required for remote Qdrant in production');
    expect(result.errors).toContain('QDRANT_URL must use HTTPS for remote Qdrant in production');
  });

  it('allows an explicitly declared private Qdrant network in production', () => {
    config.knowledge.vectorStore = 'qdrant';
    config.qdrant.url = 'http://cvg-master-rag-qdrant:6333';
    config.qdrant.apiKey = '';
    config.isProduction = true;
    config.database.allowInsecurePrivateNetwork = true;

    const result = validateConfig();

    expect(result.errors).not.toContain('QDRANT_API_KEY is required for remote Qdrant in production');
    expect(result.errors).not.toContain('QDRANT_URL must use HTTPS for remote Qdrant in production');
  });

  it('requires a positive Chatwoot account and an allowlist of inboxes', () => {
    config.chatwoot.accountId = 'not-an-account';
    config.chatwoot.inboxIds = [0, Number.NaN];

    const result = validateConfig();

    expect(result.errors).toContain('CHATWOOT_ACCOUNT_ID must be a positive integer');
    expect(result.errors).toContain('CHATWOOT_INBOX_IDS must contain positive comma-separated integers');
  });

  it('requires webhook verification outside production too', () => {
    config.isProduction = false;
    config.chatwoot.webhookSecret = '';

    expect(validateConfig().errors).toContain('CHATWOOT_WEBHOOK_SECRET is required');
  });

  it('rejects privileged database credentials in production', () => {
    config.isProduction = true;
    config.database.user = 'postgres';
    config.database.allowInsecurePrivateNetwork = true;
    config.redis.username = 'cvg-agent';
    config.redis.password = 'secret';

    expect(validateConfig().errors).toContain(
      'DATABASE_URL must use a least-privilege application role in production'
    );
  });

  it('requires verified store transport unless a private network is explicitly declared', () => {
    config.isProduction = true;
    config.database.user = 'cvg_agent';
    config.database.url = 'postgresql://cvg_agent:secret@db.example.com/cvg';
    config.database.allowInsecurePrivateNetwork = false;
    config.redis.url = 'redis://redis.example.com:6379';
    config.redis.username = 'cvg-agent';
    config.redis.password = 'secret';

    const errors = validateConfig().errors;

    expect(errors).toContain('DATABASE_URL must use sslmode=verify-full in production');
    expect(errors).toContain('REDIS_URL must use rediss:// in production');
  });

  it('requires authenticated Redis identity in production', () => {
    config.isProduction = true;
    config.database.user = 'cvg_agent';
    config.database.allowInsecurePrivateNetwork = true;
    config.redis.username = '';
    config.redis.password = '';

    expect(validateConfig().errors).toContain(
      'REDIS_USERNAME and REDIS_PASSWORD are required in production'
    );
  });

  it('fails closed when privacy operations lack approved-shaped policy and evidence', () => {
    config.privacy.enabled = true;
    config.privacy.retentionPoliciesJson = JSON.stringify([{
      id: 'unsafe-policy',
      store: 'postgres',
      resource: 'arbitrary_table',
      retentionDays: 30,
      batchSize: 100,
    }]);
    config.privacy.recoveryCheckpointsJson = '[]';
    config.privacy.qdrantAttestationId = '';
    config.privacy.logsAttestationId = '';

    const errors = validateConfig().errors;
    expect(errors).toContain(
      'PRIVACY_RETENTION_POLICIES_JSON must contain approved allowlisted policies'
    );
    expect(errors).toContain(
      'PRIVACY_RECOVERY_CHECKPOINTS_JSON must contain a verified checkpoint'
    );
    expect(errors).toContain(
      'PRIVACY_QDRANT_ATTESTATION_ID is required when privacy operations are enabled'
    );
    expect(errors).toContain(
      'PRIVACY_LOGS_ATTESTATION_ID is required when privacy operations are enabled'
    );
  });

  it('accepts complete privacy evidence with allowlisted resources', () => {
    config.privacy.enabled = true;
    config.privacy.retentionPoliciesJson = JSON.stringify([
      {
        id: 'messages-approved-v1',
        store: 'postgres',
        resource: 'messages',
        retentionDays: 30,
        batchSize: 100,
      },
      {
        id: 'dlq-approved-v1',
        store: 'redis',
        resource: 'webhook_dlq',
        retentionDays: 7,
        batchSize: 100,
      },
    ]);
    config.privacy.recoveryCheckpointsJson = JSON.stringify([{
      id: 'backup-20260802-0001',
      tenantId: '1',
      createdAt: '2026-08-02T10:00:00.000Z',
      verified: true,
    }]);
    config.privacy.qdrantAttestationId = 'qdrant-inventory-v1';
    config.privacy.logsAttestationId = 'logs-inventory-v1';

    const errors = validateConfig().errors.filter((error) => error.startsWith('PRIVACY_'));
    expect(errors).toEqual([]);
  });

  it('requires contact PII encryption in production and validates the key ring', () => {
    config.isProduction = true;
    config.pii.encryptionRequired = false;
    expect(validateConfig().errors).toContain('PII_ENCRYPTION_REQUIRED must be true in production');

    config.pii.encryptionRequired = true;
    config.pii.activeKeyId = 'active';
    config.pii.encryptionKeysJson = JSON.stringify({ active: 'not-a-32-byte-key' });
    config.pii.lookupKey = 'also-invalid';
    expect(validateConfig().errors).toContain(
      'PII encryption keys and active key id must be valid 32-byte base64 keys'
    );

    const key = Buffer.alloc(32, 5).toString('base64');
    config.pii.encryptionKeysJson = JSON.stringify({ active: key });
    config.pii.lookupKey = key;
    expect(validateConfig().errors.filter((error) => error.startsWith('PII'))).toEqual([]);
  });
});
