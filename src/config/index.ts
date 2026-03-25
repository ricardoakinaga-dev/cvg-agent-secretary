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
  logging: {
    level: getOptionalEnv('LOG_LEVEL', 'info'),
  },
};

// Validate configuration
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required secrets
  if (!config.database.url) errors.push('DATABASE_URL is required');
  if (!config.redis.url) errors.push('REDIS_URL is required');
  if (!config.openai.apiKey) errors.push('OPENAI_API_KEY is required');
  if (!config.chatwoot.apiToken) errors.push('CHATWOOT_API_TOKEN is required');
  if (!config.chatwoot.accountId) errors.push('CHATWOOT_ACCOUNT_ID is required');

  // Warn about missing recommended secrets in production
  if (config.isProduction) {
    if (!config.chatwoot.webhookSecret) {
      errors.push('CHATWOOT_WEBHOOK_SECRET is recommended in production');
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
    logging: config.logging,
  };
}
