import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from './modules/logging';
import { processWebhookEvent, processConversationCreated } from './modules/runtime/agentRuntime';
import { chatwootClient } from './modules/chatwoot/client';
import { HealthStatus, DependencyStatus, ChatwootWebhookPayload } from './shared/types';
import { redisClient } from './shared/redis';
import { openaiClient } from './modules/openai/client';
import { apiLimiter, webhookLimiter } from './middleware/rate-limit';
import { authenticateApi, requirePermission } from './middleware/auth';
import { verifyChatwootSignature } from './middleware/chatwoot-signature';
import { analyticsService } from './modules/analytics/index';
import { knowledgeAdminRouter } from './modules/knowledge/adminRoutes';
import { knowledgeRetrievalService } from './modules/knowledge/retrieval';
import { schedulingAdminRouter } from './modules/scheduling/adminRoutes';
import { metrics } from './shared/metrics';
import { checkDatabaseConnection } from './shared/db';

const app = express();

// Middleware
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as Request).rawBody = Buffer.from(buf);
  },
}));

// Request ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || randomUUID();
  next();
});

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = req.headers['x-correlation-id'] as string | undefined;
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    correlationId,
  });
  next();
});

// Rate limiting
app.use('/api', apiLimiter);
app.use('/webhooks', webhookLimiter);

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  const health = await getHealthStatus();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Readiness check
app.get('/ready', async (req: Request, res: Response) => {
  const isReady = await checkReadiness();
  res.status(isReady ? 200 : 503).json({ ready: isReady });
});

app.use('/api/knowledge', authenticateApi, knowledgeAdminRouter);
app.use('/api/scheduling', authenticateApi, schedulingAdminRouter);

// Analytics dashboard endpoint
app.get('/api/analytics/dashboard', authenticateApi, requirePermission('analytics:read'), async (req: Request, res: Response) => {
  try {
    const since = req.query.since 
      ? new Date(req.query.since as string) 
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const eventStats = await analyticsService.getEventStats(since);
    const allMetrics = metrics.getAllMetrics() as { counters: Record<string, number>, gauges: Record<string, number> };

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
  } catch (error) {
    logger.error('Dashboard error', error as Error);
    res.status(500).json({ error: 'Failed to generate dashboard' });
  }
});

// Metrics endpoint
app.get('/api/metrics', authenticateApi, requirePermission('analytics:read'), async (req: Request, res: Response) => {
  try {
    const allMetrics = metrics.getAllMetrics();
    res.json(allMetrics);
  } catch (error) {
    logger.error('Metrics error', error as Error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Audit trail endpoint
app.get('/api/audit/events', authenticateApi, requirePermission('audit:read'), async (req: Request, res: Response) => {
  try {
    const { auditService } = await import('./modules/audit/service');
    
    const filters: Record<string, unknown> = {};
    if (req.query.eventType) filters.eventType = req.query.eventType;
    if (req.query.actor) filters.actor = req.query.actor;
    if (req.query.since) filters.since = new Date(req.query.since as string);
    if (req.query.limit) filters.limit = parseInt(req.query.limit as string, 10);

    const events = await auditService.getEvents(filters as Parameters<typeof auditService.getEvents>[0]);
    res.json({ events, count: events.length });
  } catch (error) {
    logger.error('Audit events error', error as Error);
    res.status(500).json({ error: 'Failed to get audit events' });
  }
});

// Operational report endpoint - weekly supervised operation metrics
app.get('/api/operational-report', authenticateApi, requirePermission('analytics:read'), async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string, 10) || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const eventStats = await analyticsService.getEventStats(since);
    const allMetrics = metrics.getAllMetrics() as { counters: Record<string, number> };

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
  } catch (error) {
    logger.error('Operational report error', error as Error);
    res.status(500).json({ error: 'Failed to generate operational report' });
  }
});

// Chatwoot webhook endpoint
app.post('/webhooks/chatwoot', verifyChatwootSignature, async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const log = logger.child({ correlationId });

  log.info('Chatwoot webhook received', {
    event: req.body.event,
  });

  try {
    const { event } = req.body;

    switch (event) {
      case 'message_created':
        await processWebhookEvent(req.body);
        break;

      case 'conversation_created':
        await processConversationCreated(req.body);
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
  } catch (error) {
    log.error('Error processing webhook', error as Error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Error handling middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction): void => {
  const correlationId = req.headers['x-correlation-id'] as string;
  logger.error('Unhandled error', err, { correlationId });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

/**
 * Get health status of all dependencies
 */
async function getHealthStatus(): Promise<HealthStatus> {
  const dependencies: DependencyStatus = {
    redis: 'disconnected',
    postgres: 'disconnected',
    chatwoot: 'disconnected',
    openai: 'disconnected',
    knowledge: 'disconnected',
  };

  let allHealthy = true;

  // Check Redis
  try {
    const redisHealthy = await redisClient.ping();
    dependencies.redis = redisHealthy ? 'connected' : 'error';
    allHealthy = allHealthy && redisHealthy;
  } catch {
    dependencies.redis = 'error';
    allHealthy = false;
  }

  // Check Postgres
  try {
    const postgresHealthy = await checkDatabaseConnection();
    dependencies.postgres = postgresHealthy ? 'connected' : 'error';
    allHealthy = allHealthy && postgresHealthy;
  } catch {
    dependencies.postgres = 'error';
    allHealthy = false;
  }

  // Check Chatwoot
  try {
    const chatwootHealthy = await chatwootClient.healthCheck();
    dependencies.chatwoot = chatwootHealthy ? 'connected' : 'error';
    allHealthy = allHealthy && chatwootHealthy;
  } catch {
    dependencies.chatwoot = 'error';
    allHealthy = false;
  }

  // Check OpenAI
  try {
    const openaiHealthy = await openaiClient.healthCheck();
    dependencies.openai = openaiHealthy ? 'connected' : 'error';
    allHealthy = allHealthy && openaiHealthy;
  } catch {
    dependencies.openai = 'error';
    allHealthy = false;
  }

  // Check knowledge retrieval. Qdrant is optional; the service reports healthy
  // when its active retrieval backend, including PostgreSQL fallback, is usable.
  try {
    const knowledgeHealthy = await knowledgeRetrievalService.healthCheck();
    dependencies.knowledge = knowledgeHealthy ? 'connected' : 'error';
    allHealthy = allHealthy && knowledgeHealthy;
  } catch {
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
async function checkReadiness(): Promise<boolean> {
  try {
    // Check Redis connection
    const redisReady = await redisClient.ping();
    if (!redisReady) return false;

    // Check Postgres connection
    const postgresReady = await checkDatabaseConnection();
    if (!postgresReady) return false;

    // Check Chatwoot
    const chatwootReady = await chatwootClient.healthCheck();
    if (!chatwootReady) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Process conversation status changed event
 */
async function processConversationStatusChanged(payload: ChatwootWebhookPayload): Promise<void> {
  const log = logger.child({ event: 'conversation_status_changed' });
  
  try {
    const conversationId = String(payload.conversation?.id);
    const newStatus = payload.conversation?.status;
    
    log.info('Conversation status changed', {
      conversationId,
      newStatus,
    });

    // Track analytics when conversation is resolved or closed
    if (newStatus === 'resolved' || newStatus === 'closed') {
      await analyticsService.trackEvent({
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
  } catch (error) {
    log.error('Error processing conversation status change', error as Error);
  }
}

export { app };
