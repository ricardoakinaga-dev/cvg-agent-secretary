import dotenv from 'dotenv';
import pgConnectionString from 'pg-connection-string';

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
}

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  database: DatabaseConfig;
  redis: {
    url: string;
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
    webhookSecret?: string;
  };
  auth: {
    apiToken: string;
  };
  conversation: {
    handoffTimeoutMinutes: number;
  };
  logging: {
    level: string;
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
  port: parseInt(getOptionalEnv('PORT', '3000'), 10),
  database: {
    url: getRequiredEnv('DATABASE_URL'),
    ...parseDatabaseUrl(getRequiredEnv('DATABASE_URL')),
    maxConnections: parseInt(getOptionalEnv('DB_MAX_CONNECTIONS', '10'), 10),
  },
  redis: {
    url: getRequiredEnv('REDIS_URL'),
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
    webhookSecret: getOptionalEnv('CHATWOOT_WEBHOOK_SECRET', ''),
  },
  auth: {
    apiToken: getOptionalEnv('API_ADMIN_TOKEN', ''),
  },
  conversation: {
    handoffTimeoutMinutes: parseInt(getOptionalEnv('HANDOFF_TIMEOUT_MINUTES', '10'), 10),
  },
  logging: {
    level: getOptionalEnv('LOG_LEVEL', 'info'),
  },
};

// Validate configuration
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.database.url) errors.push('DATABASE_URL is required');
  if (!config.redis.url) errors.push('REDIS_URL is required');
  if (!['postgres', 'qdrant'].includes(config.knowledge.vectorStore)) {
    errors.push('KNOWLEDGE_VECTOR_STORE must be postgres or qdrant');
  }
  if (!config.openai.apiKey) errors.push('OPENAI_API_KEY is required');
  if (!config.chatwoot.apiToken) errors.push('CHATWOOT_API_TOKEN is required');
  if (!config.chatwoot.accountId) errors.push('CHATWOOT_ACCOUNT_ID is required');
  if (!Number.isFinite(config.conversation.handoffTimeoutMinutes) || config.conversation.handoffTimeoutMinutes < 1) {
    errors.push('HANDOFF_TIMEOUT_MINUTES must be a positive number');
  }

  if (config.isProduction) {
    if (!config.chatwoot.webhookSecret) {
      errors.push('CHATWOOT_WEBHOOK_SECRET is required in production');
    }
    if (!config.auth.apiToken) {
      errors.push('API_ADMIN_TOKEN is required in production');
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
    port: config.port,
    database: {
      host: config.database.host,
      port: config.database.port,
      name: config.database.name,
      maxConnections: config.database.maxConnections,
    },
    redis: {
      url: config.redis.url.replace(/:[^@]+@/, ':***@'),
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
    },
    auth: {
      apiTokenConfigured: Boolean(config.auth.apiToken),
    },
    conversation: config.conversation,
    logging: config.logging,
  };
}
