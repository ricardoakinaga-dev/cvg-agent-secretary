import dotenv from 'dotenv';
import pgConnectionString from 'pg-connection-string';
import { createPublicKey } from 'node:crypto';

// Load environment variables
dotenv.config();

export interface DatabaseConfig {
  url: string;
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  maxConnections: number;
  allowInsecurePrivateNetwork: boolean;
}

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  autonomousAgentEnabled: boolean;
  productionGoLiveApproved: boolean;
  port: number;
  trustProxyHops: number;
  database: DatabaseConfig;
  redis: {
    url: string;
    username?: string;
    password?: string;
  };
  knowledge: {
    vectorStore: 'postgres' | 'qdrant';
  };
  qdrant: {
    url: string;
    apiKey: string;
    collection: string;
    vectorName: string;
    sparseVectorName: string;
    prefetchLimit: number;
    scoreThreshold: number;
    createCollection: boolean;
    readOnly: boolean;
  };
  openai: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  openrouter?: {
    apiKey?: string;
    model?: string;
  };
  aiProvider: 'openai' | 'openrouter' | 'auto';
  chatwoot: {
    apiUrl: string;
    apiToken: string;
    accountId: string;
    inboxIds: number[];
    webhookSecret: string;
    confirmInboundMessages: boolean;
    allowContentReconciliationFallback: boolean;
    allowContentTakeoverFallback: boolean;
  };
  auth: {
    apiToken: string;
    jwtPublicKey: string;
    jwtIssuer: string;
    jwtAudience: string;
    allowLegacyApiToken: boolean;
  };
  conversation: {
    handoffTimeoutMinutes: number;
    lockTtlSeconds: number;
    lockWaitMs: number;
    lockPollMs: number;
  };
  logging: {
    level: string;
  };
  privacy: {
    enabled: boolean;
    automaticPurgeEnabled: boolean;
    retentionPoliciesJson: string;
    recoveryCheckpointsJson: string;
    qdrantAttestationId: string;
    logsAttestationId: string;
  };
  pii: {
    encryptionRequired: boolean;
    activeKeyId: string;
    encryptionKeysJson: string;
    lookupKey: string;
  };
}

function getRequiredEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function normalizePem(value: string): string {
  return value.replace(/\\n/g, '\n');
}

function isValidJwtPublicKey(value: string): boolean {
  try {
    return createPublicKey(value).asymmetricKeyType === 'rsa';
  } catch {
    return false;
  }
}

function parseIntegerList(value: string): number[] {
  return value.split(',').map((entry) => Number(entry.trim()));
}

function isIntegerBetween(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isRemoteUrl(urlValue: string): boolean {
  try {
    const { hostname } = new URL(urlValue);
    return !['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return true;
  }
}

function urlUsesTls(urlValue: string, secureProtocol: string): boolean {
  try {
    return new URL(urlValue).protocol === secureProtocol;
  } catch {
    return false;
  }
}

function isHttpUrl(urlValue: string): boolean {
  try {
    const protocol = new URL(urlValue).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function databaseRequiresVerifiedTls(urlValue: string): boolean {
  try {
    const sslMode = new URL(urlValue).searchParams.get('sslmode');
    return sslMode === 'verify-full';
  } catch {
    return false;
  }
}

function parseDatabaseUrl(url: string): { host: string; port: number; name: string; user: string; password: string } {
  const parsed = pgConnectionString.parse(url);
  return {
    user: parsed.user || '',
    password: parsed.password || '',
    host: parsed.host || 'localhost',
    port: parsed.port ? parseInt(String(parsed.port), 10) : 5432,
    name: parsed.database || '',
  };
}

const nodeEnv = getOptionalEnv('NODE_ENV', 'development');

export const config: AppConfig = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  autonomousAgentEnabled: getOptionalEnv('AUTONOMOUS_AGENT_ENABLED', 'false') === 'true',
  productionGoLiveApproved: getOptionalEnv('PRODUCTION_GO_LIVE_APPROVED', 'false') === 'true',
  port: parseInt(getOptionalEnv('PORT', '3000'), 10),
  trustProxyHops: parseInt(getOptionalEnv('TRUST_PROXY_HOPS', '0'), 10),
  database: {
    url: getRequiredEnv('DATABASE_URL'),
    ...parseDatabaseUrl(getRequiredEnv('DATABASE_URL')),
    maxConnections: parseInt(getOptionalEnv('DB_MAX_CONNECTIONS', '10'), 10),
    allowInsecurePrivateNetwork: getOptionalEnv('ALLOW_INSECURE_PRIVATE_STORES', 'false') === 'true',
  },
  redis: {
    url: getRequiredEnv('REDIS_URL'),
    username: getOptionalEnv('REDIS_USERNAME', ''),
    password: getOptionalEnv('REDIS_PASSWORD', ''),
  },
  knowledge: {
    vectorStore: getOptionalEnv('KNOWLEDGE_VECTOR_STORE', 'postgres') as 'postgres' | 'qdrant',
  },
  qdrant: {
    url: getOptionalEnv('QDRANT_URL', 'http://127.0.0.1:6333'),
    apiKey: getOptionalEnv('QDRANT_API_KEY', ''),
    collection: getOptionalEnv('QDRANT_COLLECTION', 'cvg_agent_secretary'),
    vectorName: getOptionalEnv('QDRANT_VECTOR_NAME', 'dense'),
    sparseVectorName: getOptionalEnv('QDRANT_SPARSE_VECTOR_NAME', 'sparse'),
    prefetchLimit: parseInt(getOptionalEnv('QDRANT_PREFETCH_LIMIT', '50'), 10),
    scoreThreshold: parseFloat(getOptionalEnv('QDRANT_SCORE_THRESHOLD', '0')),
    createCollection: getOptionalEnv('QDRANT_CREATE_COLLECTION', 'false') === 'true',
    readOnly: getOptionalEnv('QDRANT_READ_ONLY', 'true') !== 'false',
  },
  openai: {
    apiKey: getRequiredEnv('OPENAI_API_KEY'),
    model: getOptionalEnv('OPENAI_MODEL', 'gpt-4'),
    maxTokens: parseInt(getOptionalEnv('OPENAI_MAX_TOKENS', '500'), 10),
    temperature: parseFloat(getOptionalEnv('OPENAI_TEMPERATURE', '0.7')),
  },
  openrouter: {
    apiKey: getOptionalEnv('OPENROUTER_API_KEY', ''),
    model: getOptionalEnv('OPENROUTER_MODEL', ''),
  },
  aiProvider: getOptionalEnv('AI_PROVIDER', 'auto') as 'openai' | 'openrouter' | 'auto',
  chatwoot: {
    apiUrl: getOptionalEnv('CHATWOOT_API_URL', 'https://app.chatwoot.com'),
    apiToken: getRequiredEnv('CHATWOOT_API_TOKEN'),
    accountId: getRequiredEnv('CHATWOOT_ACCOUNT_ID'),
    inboxIds: parseIntegerList(getRequiredEnv('CHATWOOT_INBOX_IDS')),
    webhookSecret: getOptionalEnv('CHATWOOT_WEBHOOK_SECRET', ''),
    confirmInboundMessages: getOptionalEnv('CHATWOOT_CONFIRM_INBOUND_MESSAGES', 'false') === 'true',
    allowContentReconciliationFallback: getOptionalEnv(
      'CHATWOOT_ALLOW_CONTENT_RECONCILIATION_FALLBACK',
      nodeEnv === 'production' ? 'false' : 'true'
    ) === 'true',
    allowContentTakeoverFallback: getOptionalEnv(
      'CHATWOOT_ALLOW_CONTENT_TAKEOVER_FALLBACK',
      nodeEnv === 'production' ? 'false' : 'true'
    ) === 'true',
  },
  auth: {
    apiToken: getOptionalEnv('API_ADMIN_TOKEN', ''),
    jwtPublicKey: normalizePem(getOptionalEnv('API_JWT_PUBLIC_KEY', '')),
    jwtIssuer: getOptionalEnv('API_JWT_ISSUER', ''),
    jwtAudience: getOptionalEnv('API_JWT_AUDIENCE', ''),
    allowLegacyApiToken: getOptionalEnv('ALLOW_LEGACY_API_TOKEN', 'false') === 'true',
  },
  conversation: {
    handoffTimeoutMinutes: parseInt(getOptionalEnv('HANDOFF_TIMEOUT_MINUTES', '10'), 10),
    lockTtlSeconds: parseInt(getOptionalEnv('CONVERSATION_LOCK_TTL_SECONDS', '300'), 10),
    lockWaitMs: parseInt(getOptionalEnv('CONVERSATION_LOCK_WAIT_MS', '10000'), 10),
    lockPollMs: parseInt(getOptionalEnv('CONVERSATION_LOCK_POLL_MS', '200'), 10),
  },
  logging: {
    level: getOptionalEnv('LOG_LEVEL', 'info'),
  },
  privacy: {
    enabled: getOptionalEnv('PRIVACY_ENABLED', 'false') === 'true',
    automaticPurgeEnabled: getOptionalEnv('PRIVACY_AUTOMATIC_PURGE_ENABLED', 'false') === 'true',
    retentionPoliciesJson: getOptionalEnv('PRIVACY_RETENTION_POLICIES_JSON', '[]'),
    recoveryCheckpointsJson: getOptionalEnv('PRIVACY_RECOVERY_CHECKPOINTS_JSON', '[]'),
    qdrantAttestationId: getOptionalEnv('PRIVACY_QDRANT_ATTESTATION_ID', ''),
    logsAttestationId: getOptionalEnv('PRIVACY_LOGS_ATTESTATION_ID', ''),
  },
  pii: {
    encryptionRequired: getOptionalEnv('PII_ENCRYPTION_REQUIRED', 'false') === 'true',
    activeKeyId: getOptionalEnv('PII_ACTIVE_KEY_ID', ''),
    encryptionKeysJson: getOptionalEnv('PII_ENCRYPTION_KEYS_JSON', '{}'),
    lookupKey: getOptionalEnv('PII_LOOKUP_KEY', ''),
  },
};

function parseJsonArray(value: string): unknown[] | null {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const privacyRetentionResources: Readonly<Record<string, ReadonlySet<string>>> = {
  postgres: new Set([
    'messages',
    'conversation_summaries',
    'tool_executions',
    'handoffs',
    'sector_notifications',
    'followup_tasks',
    'analytics_events',
    'response_feedback',
    'audit_logs',
    'inbound_receipts',
    'response_outbox',
    'conversation_control_state',
    'scheduling_state',
  ]),
  redis: new Set(['webhook_dlq']),
};

function validPrivacyPolicies(value: string): boolean {
  const policies = parseJsonArray(value);
  if (!policies || policies.length === 0) return false;
  const ids = new Set<string>();
  return policies.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const policy = item as Record<string, unknown>;
    const id = policy.id;
    const store = policy.store;
    const resource = policy.resource;
    const retentionDays = policy.retentionDays;
    const batchSize = policy.batchSize;
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,100}$/.test(id) || ids.has(id)) return false;
    ids.add(id);
    return typeof store === 'string'
      && typeof resource === 'string'
      && Boolean(privacyRetentionResources[store]?.has(resource))
      && typeof retentionDays === 'number'
      && Number.isInteger(retentionDays)
      && retentionDays >= 1
      && retentionDays <= 3650
      && typeof batchSize === 'number'
      && Number.isInteger(batchSize)
      && batchSize >= 1
      && batchSize <= 10_000;
  });
}

function validPrivacyCheckpoints(value: string): boolean {
  const checkpoints = parseJsonArray(value);
  return Boolean(checkpoints && checkpoints.length > 0 && checkpoints.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const checkpoint = item as Record<string, unknown>;
    return typeof checkpoint.id === 'string'
      && /^[a-zA-Z0-9._:-]{8,200}$/.test(checkpoint.id)
      && typeof checkpoint.tenantId === 'string'
      && /^[1-9]\d{0,18}$/.test(checkpoint.tenantId)
      && typeof checkpoint.createdAt === 'string'
      && Number.isFinite(Date.parse(checkpoint.createdAt))
      && checkpoint.verified === true;
  }));
}

function validBase64Key(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    return Buffer.from(value, 'base64').length === 32;
  } catch {
    return false;
  }
}

function validPiiEncryptionConfiguration(): boolean {
  if (!config.pii.activeKeyId || !/^[a-zA-Z0-9_-]{1,64}$/.test(config.pii.activeKeyId)) {
    return false;
  }
  let keys: unknown;
  try {
    keys = JSON.parse(config.pii.encryptionKeysJson);
  } catch {
    return false;
  }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return false;
  const keyMap = keys as Record<string, unknown>;
  return validBase64Key(keyMap[config.pii.activeKeyId])
    && Object.entries(keyMap).length > 0
    && Object.entries(keyMap).every(([keyId, key]) =>
      /^[a-zA-Z0-9_-]{1,64}$/.test(keyId) && validBase64Key(key))
    && validBase64Key(config.pii.lookupKey);
}

// Validate configuration
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.database.url) errors.push('DATABASE_URL is required');
  if (!config.redis.url) errors.push('REDIS_URL is required');
  if (!isIntegerBetween(config.port, 1, 65535)) {
    errors.push('PORT must be an integer between 1 and 65535');
  }
  if (!isIntegerBetween(config.trustProxyHops, 0, 10)) {
    errors.push('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  }
  if (!isIntegerBetween(config.database.maxConnections, 1, 100)) {
    errors.push('DB_MAX_CONNECTIONS must be an integer between 1 and 100');
  }
  if (config.isProduction) {
    if (!config.autonomousAgentEnabled) {
      errors.push('AUTONOMOUS_AGENT_ENABLED must be true in production after the go-live gate is approved');
    }
    if (config.autonomousAgentEnabled && !config.productionGoLiveApproved) {
      errors.push('PRODUCTION_GO_LIVE_APPROVED must be true when autonomous agent is enabled');
    }
    if (!config.chatwoot.confirmInboundMessages) {
      errors.push('CHATWOOT_CONFIRM_INBOUND_MESSAGES must be true in production');
    }
    if (config.chatwoot.allowContentReconciliationFallback) {
      errors.push('CHATWOOT_ALLOW_CONTENT_RECONCILIATION_FALLBACK must be false in production');
    }
    if (config.chatwoot.allowContentTakeoverFallback) {
      errors.push('CHATWOOT_ALLOW_CONTENT_TAKEOVER_FALLBACK must be false in production');
    }
    if (!config.privacy.enabled) {
      errors.push('PRIVACY_ENABLED must be true in production');
    }
    if (!config.privacy.automaticPurgeEnabled) {
      errors.push('PRIVACY_AUTOMATIC_PURGE_ENABLED must be true in production');
    }
    if (['postgres', 'root'].includes(config.database.user.toLowerCase())) {
      errors.push('DATABASE_URL must use a least-privilege application role in production');
    }
    if (!config.database.allowInsecurePrivateNetwork && !databaseRequiresVerifiedTls(config.database.url)) {
      errors.push('DATABASE_URL must use sslmode=verify-full in production');
    }
    if (!config.redis.username || !config.redis.password) {
      errors.push('REDIS_USERNAME and REDIS_PASSWORD are required in production');
    }
    if (!config.database.allowInsecurePrivateNetwork && !urlUsesTls(config.redis.url, 'rediss:')) {
      errors.push('REDIS_URL must use rediss:// in production');
    }
  }
  if (config.privacy.enabled) {
    if (!validPrivacyPolicies(config.privacy.retentionPoliciesJson)) {
      errors.push('PRIVACY_RETENTION_POLICIES_JSON must contain approved allowlisted policies');
    }
    if (!validPrivacyCheckpoints(config.privacy.recoveryCheckpointsJson)) {
      errors.push('PRIVACY_RECOVERY_CHECKPOINTS_JSON must contain a verified checkpoint');
    }
    if (!config.privacy.qdrantAttestationId) {
      errors.push('PRIVACY_QDRANT_ATTESTATION_ID is required when privacy operations are enabled');
    }
    if (!config.privacy.logsAttestationId) {
      errors.push('PRIVACY_LOGS_ATTESTATION_ID is required when privacy operations are enabled');
    }
  }
  if (config.isProduction && !config.pii.encryptionRequired) {
    errors.push('PII_ENCRYPTION_REQUIRED must be true in production');
  }
  if (config.pii.encryptionRequired && !validPiiEncryptionConfiguration()) {
    errors.push('PII encryption keys and active key id must be valid 32-byte base64 keys');
  }
  if (!['postgres', 'qdrant'].includes(config.knowledge.vectorStore)) {
    errors.push('KNOWLEDGE_VECTOR_STORE must be postgres or qdrant');
  }
  if (!['openai', 'openrouter', 'auto'].includes(config.aiProvider)) {
    errors.push('AI_PROVIDER must be openai, openrouter or auto');
  }
  if (!config.openai.apiKey) errors.push('OPENAI_API_KEY is required');
  if (!isIntegerBetween(config.openai.maxTokens, 1, 32768)) {
    errors.push('OPENAI_MAX_TOKENS must be an integer between 1 and 32768');
  }
  if (!Number.isFinite(config.openai.temperature) || config.openai.temperature < 0 || config.openai.temperature > 2) {
    errors.push('OPENAI_TEMPERATURE must be between 0 and 2');
  }
  if (config.aiProvider === 'openrouter') {
    if (!config.openrouter?.apiKey) {
      errors.push('OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter');
    }
    if (!config.openrouter?.model) {
      errors.push('OPENROUTER_MODEL is required when AI_PROVIDER=openrouter');
    }
  }
  if (!config.chatwoot.apiToken) errors.push('CHATWOOT_API_TOKEN is required');
  if (!isHttpUrl(config.chatwoot.apiUrl)) {
    errors.push('CHATWOOT_API_URL must be a valid http(s) URL');
  }
  if (
    config.isProduction
    && !config.database.allowInsecurePrivateNetwork
    && !urlUsesTls(config.chatwoot.apiUrl, 'https:')
  ) {
    errors.push('CHATWOOT_API_URL must use HTTPS in production');
  }
  if (!/^\d+$/.test(config.chatwoot.accountId) || Number(config.chatwoot.accountId) < 1) {
    errors.push('CHATWOOT_ACCOUNT_ID must be a positive integer');
  }
  if (config.chatwoot.inboxIds.length === 0 || config.chatwoot.inboxIds.some((id) => !isIntegerBetween(id, 1, Number.MAX_SAFE_INTEGER))) {
    errors.push('CHATWOOT_INBOX_IDS must contain positive comma-separated integers');
  }
  if (!config.chatwoot.webhookSecret) {
    errors.push('CHATWOOT_WEBHOOK_SECRET is required');
  }
  if (!isIntegerBetween(config.qdrant.prefetchLimit, 1, 1000)) {
    errors.push('QDRANT_PREFETCH_LIMIT must be an integer between 1 and 1000');
  }
  if (!Number.isFinite(config.qdrant.scoreThreshold) || config.qdrant.scoreThreshold < 0 || config.qdrant.scoreThreshold > 1) {
    errors.push('QDRANT_SCORE_THRESHOLD must be between 0 and 1');
  }
  if (config.knowledge.vectorStore === 'qdrant') {
    if (!config.qdrant.url) {
      errors.push('QDRANT_URL is required when KNOWLEDGE_VECTOR_STORE=qdrant');
    }
    if (
      config.isProduction
      && isRemoteUrl(config.qdrant.url)
      && !config.database.allowInsecurePrivateNetwork
    ) {
      if (!config.qdrant.apiKey) {
        errors.push('QDRANT_API_KEY is required for remote Qdrant in production');
      }
      if (!config.qdrant.url.startsWith('https://')) {
        errors.push('QDRANT_URL must use HTTPS for remote Qdrant in production');
      }
    }
  }
  if (!Number.isFinite(config.conversation.handoffTimeoutMinutes) || config.conversation.handoffTimeoutMinutes < 1) {
    errors.push('HANDOFF_TIMEOUT_MINUTES must be a positive number');
  }
  if (!Number.isSafeInteger(config.conversation.lockTtlSeconds) || config.conversation.lockTtlSeconds < 1) {
    errors.push('CONVERSATION_LOCK_TTL_SECONDS must be a positive integer');
  }
  if (!Number.isSafeInteger(config.conversation.lockWaitMs) || config.conversation.lockWaitMs < 0) {
    errors.push('CONVERSATION_LOCK_WAIT_MS must be a non-negative integer');
  }
  if (!Number.isSafeInteger(config.conversation.lockPollMs) || config.conversation.lockPollMs < 1) {
    errors.push('CONVERSATION_LOCK_POLL_MS must be a positive integer');
  }

  if (config.isProduction) {
    if (!config.auth.jwtPublicKey) errors.push('API_JWT_PUBLIC_KEY is required in production');
    else if (!isValidJwtPublicKey(config.auth.jwtPublicKey)) {
      errors.push('API_JWT_PUBLIC_KEY must be a valid RSA public key');
    }
    if (!config.auth.jwtIssuer) errors.push('API_JWT_ISSUER is required in production');
    if (!config.auth.jwtAudience) errors.push('API_JWT_AUDIENCE is required in production');
    if (config.auth.allowLegacyApiToken) {
      errors.push('ALLOW_LEGACY_API_TOKEN must be false in production');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Get safe config for logging (without secrets)
export function getSafeConfig(): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    isProduction: config.isProduction,
    autonomousAgentEnabled: config.autonomousAgentEnabled,
    productionGoLiveApproved: config.productionGoLiveApproved,
    port: config.port,
    trustProxyHops: config.trustProxyHops,
    database: {
      host: config.database.host,
      port: config.database.port,
      name: config.database.name,
      maxConnections: config.database.maxConnections,
      insecurePrivateNetworkAllowed: config.database.allowInsecurePrivateNetwork,
    },
    redis: {
      url: config.redis.url.replace(/:[^@]+@/, ':***@'),
      usernameConfigured: Boolean(config.redis.username),
      passwordConfigured: Boolean(config.redis.password),
    },
    knowledge: config.knowledge,
    qdrant: {
      urlConfigured: Boolean(config.qdrant.url),
      collection: config.qdrant.collection,
      vectorName: config.qdrant.vectorName,
      sparseVectorName: config.qdrant.sparseVectorName,
      prefetchLimit: config.qdrant.prefetchLimit,
      scoreThreshold: config.qdrant.scoreThreshold,
      createCollection: config.qdrant.createCollection,
      readOnly: config.qdrant.readOnly,
      apiKeyConfigured: Boolean(config.qdrant.apiKey),
    },
    openai: {
      model: config.openai.model,
      maxTokens: config.openai.maxTokens,
      temperature: config.openai.temperature,
    },
    aiProvider: config.aiProvider,
    chatwoot: {
      apiUrl: config.chatwoot.apiUrl,
      accountId: config.chatwoot.accountId,
      inboxIds: config.chatwoot.inboxIds,
      confirmInboundMessages: config.chatwoot.confirmInboundMessages,
      allowContentReconciliationFallback: config.chatwoot.allowContentReconciliationFallback,
      allowContentTakeoverFallback: config.chatwoot.allowContentTakeoverFallback,
    },
    auth: {
      apiTokenConfigured: Boolean(config.auth.apiToken),
      jwtPublicKeyConfigured: Boolean(config.auth.jwtPublicKey),
      jwtIssuerConfigured: Boolean(config.auth.jwtIssuer),
      jwtAudienceConfigured: Boolean(config.auth.jwtAudience),
      allowLegacyApiToken: config.auth.allowLegacyApiToken,
    },
    conversation: config.conversation,
    logging: config.logging,
    privacy: {
      enabled: config.privacy.enabled,
      retentionPoliciesConfigured: config.privacy.retentionPoliciesJson !== '[]',
      recoveryCheckpointsConfigured: config.privacy.recoveryCheckpointsJson !== '[]',
      qdrantAttestationConfigured: Boolean(config.privacy.qdrantAttestationId),
      logsAttestationConfigured: Boolean(config.privacy.logsAttestationId),
    },
    pii: {
      encryptionRequired: config.pii.encryptionRequired,
      activeKeyConfigured: Boolean(config.pii.activeKeyId),
      encryptionKeysConfigured: config.pii.encryptionKeysJson !== '{}',
      lookupKeyConfigured: Boolean(config.pii.lookupKey),
    },
  };
}
