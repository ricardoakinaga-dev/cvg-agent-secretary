"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const crypto_1 = require("crypto");
const logging_1 = require("./modules/logging");
const agentRuntime_1 = require("./modules/runtime/agentRuntime");
const client_1 = require("./modules/chatwoot/client");
const redis_1 = require("./shared/redis");
const client_2 = require("./modules/openai/client");
const rate_limit_1 = require("./middleware/rate-limit");
const auth_1 = require("./middleware/auth");
const chatwoot_signature_1 = require("./middleware/chatwoot-signature");
const index_1 = require("./modules/analytics/index");
const adminRoutes_1 = require("./modules/knowledge/adminRoutes");
const retrieval_1 = require("./modules/knowledge/retrieval");
const adminRoutes_2 = require("./modules/scheduling/adminRoutes");
const metrics_1 = require("./shared/metrics");
const db_1 = require("./shared/db");
const app = (0, express_1.default)();
exports.app = app;
// Middleware
app.use(express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = Buffer.from(buf);
    },
}));
// Request ID middleware
app.use((req, res, next) => {
    req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || (0, crypto_1.randomUUID)();
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
// Rate limiting
app.use('/api', rate_limit_1.apiLimiter);
app.use('/webhooks', rate_limit_1.webhookLimiter);
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
app.use('/api/knowledge', auth_1.authenticateApi, adminRoutes_1.knowledgeAdminRouter);
app.use('/api/scheduling', auth_1.authenticateApi, adminRoutes_2.schedulingAdminRouter);
// Analytics dashboard endpoint
app.get('/api/analytics/dashboard', auth_1.authenticateApi, (0, auth_1.requirePermission)('analytics:read'), async (req, res) => {
    try {
        const since = req.query.since
            ? new Date(req.query.since)
            : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const eventStats = await index_1.analyticsService.getEventStats(since);
        const allMetrics = metrics_1.metrics.getAllMetrics();
        const handoffRate = eventStats.conversationsStarted > 0
            ? (eventStats.handoffs / eventStats.conversationsStarted * 100).toFixed(2)
            : '0';
        const resolutionRate = eventStats.conversationsEnded > 0
            ? ((eventStats.conversationsEnded - eventStats.handoffs) / eventStats.conversationsEnded * 100).toFixed(2)
            : '0';
        // Provider breakdown
        const openaiTotal = allMetrics.counters['openai_requests_total'] || 0;
        const openaiErrors = allMetrics.counters['openai_requests_errors'] || 0;
        const openrouterTotal = allMetrics.counters['openrouter_requests_total'] || 0;
        const openrouterErrors = allMetrics.counters['openrouter_requests_errors'] || 0;
        const openaiErrorRate = openaiTotal > 0
            ? (openaiErrors / openaiTotal * 100).toFixed(2)
            : '0';
        const openrouterErrorRate = openrouterTotal > 0
            ? (openrouterErrors / openrouterTotal * 100).toFixed(2)
            : '0';
        res.json({
            summary: {
                period: {
                    since: since.toISOString(),
                    to: new Date().toISOString(),
                },
                conversations: {
                    started: eventStats.conversationsStarted,
                    ended: eventStats.conversationsEnded,
                },
                messages: {
                    received: allMetrics.counters['analytics_messages_received'] || 0,
                    sent: allMetrics.counters['analytics_responses_sent'] || 0,
                },
                handoffs: {
                    total: eventStats.handoffs,
                    rate: `${handoffRate}%`,
                },
                fallbacks: {
                    total: eventStats.fallbacks,
                },
                errors: {
                    total: eventStats.errors,
                },
                performance: {
                    avgResponseLatency: `${eventStats.avgResponseLatency}ms`,
                    autoResolutionRate: `${resolutionRate}%`,
                },
            },
            providers: {
                openai: {
                    requests: openaiTotal,
                    errors: openaiErrors,
                    errorRate: `${openaiErrorRate}%`,
                },
                openrouter: {
                    requests: openrouterTotal,
                    errors: openrouterErrors,
                    errorRate: `${openrouterErrorRate}%`,
                },
            },
            metrics: allMetrics,
            eventStats: eventStats,
        });
    }
    catch (error) {
        logging_1.logger.error('Dashboard error', error);
        res.status(500).json({ error: 'Failed to generate dashboard' });
    }
});
// Metrics endpoint
app.get('/api/metrics', auth_1.authenticateApi, (0, auth_1.requirePermission)('analytics:read'), async (req, res) => {
    try {
        const allMetrics = metrics_1.metrics.getAllMetrics();
        res.json(allMetrics);
    }
    catch (error) {
        logging_1.logger.error('Metrics error', error);
        res.status(500).json({ error: 'Failed to get metrics' });
    }
});
// Audit trail endpoint
app.get('/api/audit/events', auth_1.authenticateApi, (0, auth_1.requirePermission)('audit:read'), async (req, res) => {
    try {
        const { auditService } = await Promise.resolve().then(() => __importStar(require('./modules/audit/service')));
        const filters = {};
        if (req.query.eventType)
            filters.eventType = req.query.eventType;
        if (req.query.actor)
            filters.actor = req.query.actor;
        if (req.query.since)
            filters.since = new Date(req.query.since);
        if (req.query.limit)
            filters.limit = parseInt(req.query.limit, 10);
        const events = await auditService.getEvents(filters);
        res.json({ events, count: events.length });
    }
    catch (error) {
        logging_1.logger.error('Audit events error', error);
        res.status(500).json({ error: 'Failed to get audit events' });
    }
});
// Operational report endpoint - weekly supervised operation metrics
app.get('/api/operational-report', auth_1.authenticateApi, (0, auth_1.requirePermission)('analytics:read'), async (req, res) => {
    try {
        const days = parseInt(req.query.days, 10) || 7;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const eventStats = await index_1.analyticsService.getEventStats(since);
        const allMetrics = metrics_1.metrics.getAllMetrics();
        // Calculate rates
        const handoffRate = eventStats.conversationsStarted > 0
            ? (eventStats.handoffs / eventStats.conversationsStarted * 100)
            : 0;
        const resolutionRate = eventStats.conversationsEnded > 0
            ? ((eventStats.conversationsEnded - eventStats.handoffs) / eventStats.conversationsEnded * 100)
            : 0;
        const fallbackRate = eventStats.conversationsStarted > 0
            ? (eventStats.fallbacks / eventStats.conversationsStarted * 100)
            : 0;
        // Provider reliability
        const openaiTotal = allMetrics.counters['openai_requests_total'] || 0;
        const openaiErrors = allMetrics.counters['openai_requests_errors'] || 0;
        const openrouterTotal = allMetrics.counters['openrouter_requests_total'] || 0;
        const openrouterErrors = allMetrics.counters['openrouter_requests_errors'] || 0;
        const openaiReliability = openaiTotal > 0 ? ((openaiTotal - openaiErrors) / openaiTotal * 100) : 100;
        const openrouterReliability = openrouterTotal > 0 ? ((openrouterTotal - openrouterErrors) / openrouterTotal * 100) : 100;
        res.json({
            reportType: 'operational',
            period: {
                since: since.toISOString(),
                to: new Date().toISOString(),
                days,
            },
            kpis: {
                conversationVolume: eventStats.conversationsStarted,
                autoResolutionRate: `${resolutionRate.toFixed(1)}%`,
                handoffRate: `${handoffRate.toFixed(1)}%`,
                fallbackRate: `${fallbackRate.toFixed(1)}%`,
                avgResponseLatencyMs: eventStats.avgResponseLatency,
            },
            providers: {
                openai: {
                    requests: openaiTotal,
                    errors: openaiErrors,
                    reliability: `${openaiReliability.toFixed(1)}%`,
                },
                openrouter: {
                    requests: openrouterTotal,
                    errors: openrouterErrors,
                    reliability: `${openrouterReliability.toFixed(1)}%`,
                },
            },
            healthIndicators: {
                systemStatus: eventStats.errors === 0 ? 'healthy' : 'degraded',
                errorCount: eventStats.errors,
                handoffCount: eventStats.handoffs,
                fallbackCount: eventStats.fallbacks,
            },
        });
    }
    catch (error) {
        logging_1.logger.error('Operational report error', error);
        res.status(500).json({ error: 'Failed to generate operational report' });
    }
});
// Chatwoot webhook endpoint
app.post('/webhooks/chatwoot', chatwoot_signature_1.verifyChatwootSignature, async (req, res) => {
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
                await processConversationStatusChanged(req.body);
                break;
            case 'conversation_updated':
            case 'message_updated':
                // These events are logged but not processed
                log.info(`Event ${event} received but not processed`);
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, req, res, _next) => {
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
        postgres: 'disconnected',
        chatwoot: 'disconnected',
        openai: 'disconnected',
        knowledge: 'disconnected',
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
    // Check Postgres
    try {
        const postgresHealthy = await (0, db_1.checkDatabaseConnection)();
        dependencies.postgres = postgresHealthy ? 'connected' : 'error';
        allHealthy = allHealthy && postgresHealthy;
    }
    catch {
        dependencies.postgres = 'error';
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
    // Check knowledge retrieval. Qdrant is optional; the service reports healthy
    // when its active retrieval backend, including PostgreSQL fallback, is usable.
    try {
        const knowledgeHealthy = await retrieval_1.knowledgeRetrievalService.healthCheck();
        dependencies.knowledge = knowledgeHealthy ? 'connected' : 'error';
        allHealthy = allHealthy && knowledgeHealthy;
    }
    catch {
        dependencies.knowledge = 'error';
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
        // Check Postgres connection
        const postgresReady = await (0, db_1.checkDatabaseConnection)();
        if (!postgresReady)
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
/**
 * Process conversation status changed event
 */
async function processConversationStatusChanged(payload) {
    const log = logging_1.logger.child({ event: 'conversation_status_changed' });
    try {
        const conversationId = String(payload.conversation?.id);
        const newStatus = payload.conversation?.status;
        log.info('Conversation status changed', {
            conversationId,
            newStatus,
        });
        // Track analytics when conversation is resolved or closed
        if (newStatus === 'resolved' || newStatus === 'closed') {
            await index_1.analyticsService.trackEvent({
                eventType: 'conversation_ended',
                conversationId: `conversation-${conversationId}`,
                outcome: 'auto_resolved',
                metadata: {
                    chatwootConversationId: conversationId,
                    status: newStatus,
                },
            });
            log.info('Conversation ended event tracked', { conversationId, status: newStatus });
        }
    }
    catch (error) {
        log.error('Error processing conversation status change', error);
    }
}
//# sourceMappingURL=app.js.map