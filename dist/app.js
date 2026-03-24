"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const logging_1 = require("./modules/logging");
const agentRuntime_1 = require("./modules/runtime/agentRuntime");
const client_1 = require("./modules/chatwoot/client");
const redis_1 = require("./shared/redis");
const client_2 = require("./modules/openai/client");
const app = (0, express_1.default)();
exports.app = app;
// Middleware
app.use(express_1.default.json());
// Request ID middleware
app.use((req, res, next) => {
    req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || (0, uuid_1.v4)();
    next();
});
// Logging middleware
app.use((req, res, next) => {
    const correlationId = req.headers['x-correlation-id'];
    logging_1.logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        correlationId,
    });
    next();
});
// Health check endpoint
app.get('/health', async (req, res) => {
    const health = await getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
});
// Readiness check
app.get('/ready', async (req, res) => {
    const isReady = await checkReadiness();
    res.status(isReady ? 200 : 503).json({ ready: isReady });
});
// Chatwoot webhook endpoint
app.post('/webhooks/chatwoot', async (req, res) => {
    const correlationId = req.headers['x-correlation-id'];
    const log = logging_1.logger.child({ correlationId });
    log.info('Chatwoot webhook received', {
        event: req.body.event,
    });
    try {
        const { event } = req.body;
        switch (event) {
            case 'message_created':
                await (0, agentRuntime_1.processWebhookEvent)(req.body);
                break;
            case 'conversation_created':
                await (0, agentRuntime_1.processConversationCreated)(req.body);
                break;
            case 'conversation_status_changed':
            case 'conversation_updated':
            case 'message_updated':
                // These events are logged but not processed in Phase 1
                log.info(`Event ${event} received but not processed in Phase 1`);
                break;
            default:
                log.warn(`Unknown event type: ${event}`);
        }
        res.status(200).json({ success: true });
    }
    catch (error) {
        log.error('Error processing webhook', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});
// Error handling middleware
app.use((err, req, res, next) => {
    const correlationId = req.headers['x-correlation-id'];
    logging_1.logger.error('Unhandled error', err, { correlationId });
    res.status(500).json({ success: false, error: 'Internal server error' });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
});
/**
 * Get health status of all dependencies
 */
async function getHealthStatus() {
    const dependencies = {
        redis: 'disconnected',
        postgres: 'disconnected', // Not implemented in Phase 1
        chatwoot: 'disconnected',
        openai: 'disconnected',
    };
    let allHealthy = true;
    // Check Redis
    try {
        const redisHealthy = await redis_1.redisClient.ping();
        dependencies.redis = redisHealthy ? 'connected' : 'error';
        allHealthy = allHealthy && redisHealthy;
    }
    catch {
        dependencies.redis = 'error';
        allHealthy = false;
    }
    // Check Chatwoot
    try {
        const chatwootHealthy = await client_1.chatwootClient.healthCheck();
        dependencies.chatwoot = chatwootHealthy ? 'connected' : 'error';
        allHealthy = allHealthy && chatwootHealthy;
    }
    catch {
        dependencies.chatwoot = 'error';
        allHealthy = false;
    }
    // Check OpenAI
    try {
        const openaiHealthy = await client_2.openaiClient.healthCheck();
        dependencies.openai = openaiHealthy ? 'connected' : 'error';
        allHealthy = allHealthy && openaiHealthy;
    }
    catch {
        dependencies.openai = 'error';
        allHealthy = false;
    }
    return {
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        dependencies,
    };
}
/**
 * Check if service is ready to accept traffic
 */
async function checkReadiness() {
    try {
        // Check Redis connection
        const redisReady = await redis_1.redisClient.ping();
        if (!redisReady)
            return false;
        // Check Chatwoot
        const chatwootReady = await client_1.chatwootClient.healthCheck();
        if (!chatwootReady)
            return false;
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=app.js.map