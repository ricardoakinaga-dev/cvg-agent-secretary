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
    knowledge: {
        vectorStore: getOptionalEnv('KNOWLEDGE_VECTOR_STORE', 'postgres'),
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
    aiProvider: getOptionalEnv('AI_PROVIDER', 'auto'),
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
function validateConfig() {
    const errors = [];
    if (!exports.config.database.url)
        errors.push('DATABASE_URL is required');
    if (!exports.config.redis.url)
        errors.push('REDIS_URL is required');
    if (!['postgres', 'qdrant'].includes(exports.config.knowledge.vectorStore)) {
        errors.push('KNOWLEDGE_VECTOR_STORE must be postgres or qdrant');
    }
    if (!exports.config.openai.apiKey)
        errors.push('OPENAI_API_KEY is required');
    if (!exports.config.chatwoot.apiToken)
        errors.push('CHATWOOT_API_TOKEN is required');
    if (!exports.config.chatwoot.accountId)
        errors.push('CHATWOOT_ACCOUNT_ID is required');
    if (!Number.isFinite(exports.config.conversation.handoffTimeoutMinutes) || exports.config.conversation.handoffTimeoutMinutes < 1) {
        errors.push('HANDOFF_TIMEOUT_MINUTES must be a positive number');
    }
    if (exports.config.isProduction) {
        if (!exports.config.chatwoot.webhookSecret) {
            errors.push('CHATWOOT_WEBHOOK_SECRET is required in production');
        }
        if (!exports.config.auth.apiToken) {
            errors.push('API_ADMIN_TOKEN is required in production');
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
        knowledge: exports.config.knowledge,
        qdrant: {
            urlConfigured: Boolean(exports.config.qdrant.url),
            collection: exports.config.qdrant.collection,
            vectorName: exports.config.qdrant.vectorName,
            sparseVectorName: exports.config.qdrant.sparseVectorName,
            prefetchLimit: exports.config.qdrant.prefetchLimit,
            scoreThreshold: exports.config.qdrant.scoreThreshold,
            createCollection: exports.config.qdrant.createCollection,
            readOnly: exports.config.qdrant.readOnly,
            apiKeyConfigured: Boolean(exports.config.qdrant.apiKey),
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
        auth: {
            apiTokenConfigured: Boolean(exports.config.auth.apiToken),
        },
        conversation: exports.config.conversation,
        logging: exports.config.logging,
    };
}
//# sourceMappingURL=index.js.map