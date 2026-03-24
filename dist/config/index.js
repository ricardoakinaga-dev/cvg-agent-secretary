"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
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
    const match = url.match(/postgres(?:ql)?(?:\+ssl)?:\/\/(?:([^:]+):([^@]+)@)?([^:\/]+)(?::(\d+))?\/(.+)/);
    if (!match) {
        throw new Error('Invalid DATABASE_URL format');
    }
    return {
        user: match[1] || '',
        password: match[2] || '',
        host: match[3] || 'localhost',
        port: parseInt(match[4] || '5432', 10),
        name: match[5] || '',
    };
}
exports.config = {
    nodeEnv: getOptionalEnv('NODE_ENV', 'development'),
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
    try {
        // Test that required fields are present
        exports.config.database.url;
        exports.config.redis.url;
        exports.config.openai.apiKey;
        exports.config.chatwoot.apiToken;
        exports.config.chatwoot.accountId;
        return true;
    }
    catch (error) {
        return false;
    }
}
//# sourceMappingURL=index.js.map