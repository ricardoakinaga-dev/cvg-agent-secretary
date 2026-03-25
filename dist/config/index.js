"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateConfig = validateConfig;
exports.getSafeConfig = getSafeConfig;
const dotenv_1 = __importDefault(require("dotenv"));
const pg_connection_string_1 = __importDefault(require("pg-connection-string"));
// Load environment variables
dotenv_1.default.config();
function getRequiredEnv(key, defaultValue) {
    const value = process.env[key] || defaultValue;
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}
function getOptionalEnv(key, defaultValue) {
    return process.env[key] || defaultValue;
}
function parseDatabaseUrl(url) {
    const parsed = pg_connection_string_1.default.parse(url);
    return {
        user: parsed.user || '',
        password: parsed.password || '',
        host: parsed.host || 'localhost',
        port: parsed.port ? parseInt(String(parsed.port), 10) : 5432,
        name: parsed.database || '',
    };
}
const nodeEnv = getOptionalEnv('NODE_ENV', 'development');
exports.config = {
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
    aiProvider: getOptionalEnv('AI_PROVIDER', 'auto'),
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
function validateConfig() {
    const errors = [];
    // Check required secrets
    if (!exports.config.database.url)
        errors.push('DATABASE_URL is required');
    if (!exports.config.redis.url)
        errors.push('REDIS_URL is required');
    if (!exports.config.openai.apiKey)
        errors.push('OPENAI_API_KEY is required');
    if (!exports.config.chatwoot.apiToken)
        errors.push('CHATWOOT_API_TOKEN is required');
    if (!exports.config.chatwoot.accountId)
        errors.push('CHATWOOT_ACCOUNT_ID is required');
    // Warn about missing recommended secrets in production
    if (exports.config.isProduction) {
        if (!exports.config.chatwoot.webhookSecret) {
            errors.push('CHATWOOT_WEBHOOK_SECRET is recommended in production');
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
// Get safe config for logging (without secrets)
function getSafeConfig() {
    return {
        nodeEnv: exports.config.nodeEnv,
        isProduction: exports.config.isProduction,
        port: exports.config.port,
        database: {
            host: exports.config.database.host,
            port: exports.config.database.port,
            name: exports.config.database.name,
            maxConnections: exports.config.database.maxConnections,
        },
        redis: {
            url: exports.config.redis.url.replace(/:[^@]+@/, ':***@'),
        },
        openai: {
            model: exports.config.openai.model,
            maxTokens: exports.config.openai.maxTokens,
            temperature: exports.config.openai.temperature,
        },
        aiProvider: exports.config.aiProvider,
        chatwoot: {
            apiUrl: exports.config.chatwoot.apiUrl,
            accountId: exports.config.chatwoot.accountId,
        },
        logging: exports.config.logging,
    };
}
//# sourceMappingURL=index.js.map