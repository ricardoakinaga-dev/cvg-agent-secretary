import express, { Request, Response, NextFunction } from 'express';
import { createHash, randomUUID } from 'crypto';
import { logger } from './modules/logging';
import { HealthStatus, ChatwootWebhookPayload } from './shared/types';
import { redisClient } from './shared/redis';
import { apiLimiter, webhookLimiter } from './middleware/rate-limit';
import { authenticateApi, requirePermission } from './middleware/auth';
import { verifyChatwootSignature } from './middleware/chatwoot-signature';
import { analyticsService } from './modules/analytics/index';
import { knowledgeAdminRouter } from './modules/knowledge/adminRoutes';
import { schedulingAdminRouter } from './modules/scheduling/adminRoutes';
import { metrics } from './shared/metrics';
import { checkDatabaseConnection } from './shared/db';
import { validateBody } from './modules/validation/middleware';
import { ChatwootWebhookSchema } from './modules/validation/schemas';
import { chatwootWebhookWorker } from './modules/webhook/worker';
import { config } from './config';
import { createPrivacyRuntime } from './modules/privacy/runtime';
import { observabilityRouter } from './modules/observability';

const app = express();
app.set('trust proxy', config.trustProxyHops);
const READINESS_CACHE_TTL_MS = 5_000;
const READINESS_TIMEOUT_MS = 1_000;

let readinessCache: { ready: boolean; expiresAt: number } | null = null;
let readinessCheckInFlight: Promise<boolean> | null = null;

// Reject abusive webhook traffic before allocating memory for JSON parsing.
app.use('/webhooks', webhookLimiter);
// Metrics are GET-only and protected before the global JSON parser so an
// unauthenticated oversized body cannot consume parsing memory.
app.use('/api/metrics', observabilityRouter);

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
if (config.privacy.enabled) {
  let privacyRuntime: ReturnType<typeof createPrivacyRuntime> | undefined;
  app.use('/api/privacy', authenticateApi, (req, res, next) => {
    try {
      privacyRuntime ??= createPrivacyRuntime();
      privacyRuntime(req, res, next);
    } catch (error) {
      logger.error('Privacy runtime initialization failed', error);
      res.status(503).json({
        success: false,
        error: 'Privacy operations are not configured',
      });
    }
  });
}

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
app.post(
  '/webhooks/chatwoot',
  verifyChatwootSignature,
  validateBody(ChatwootWebhookSchema),
  async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const log = logger.child({ correlationId });

  log.info('Chatwoot webhook received', {
    event: req.body.event,
  });

  try {
    const timestamp = req.header('x-chatwoot-timestamp') as string;
    const deliveryId = createHash('sha256')
      .update(timestamp)
      .update('.')
      .update(req.rawBody as Buffer)
      .digest('hex');
    const job = await chatwootWebhookWorker.enqueue(
      req.body as ChatwootWebhookPayload,
      correlationId,
      deliveryId
    );
    res.status(202).json(job
      ? { success: true, queued: true }
      : { success: true, queued: false, duplicate: true });
  } catch (error) {
    log.error('Error queueing webhook', error as Error);
    res.status(503).json({ success: false, error: 'Webhook queue unavailable' });
  }
  }
);

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
 * Report process liveness without invoking external dependencies.
 */
async function getHealthStatus(): Promise<Pick<HealthStatus, 'status' | 'timestamp' | 'version'>> {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
}

async function runReadinessChecks(): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutResult = new Promise<boolean>((resolve) => {
    timeout = setTimeout(() => resolve(false), READINESS_TIMEOUT_MS);
    timeout.unref();
  });

  try {
    const dependencyResult = Promise.all([
      redisClient.ping(),
      checkDatabaseConnection(),
    ]).then((results) => results.every(Boolean));

    return await Promise.race([dependencyResult, timeoutResult]);
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Check if service is ready to accept traffic
 */
async function checkReadiness(): Promise<boolean> {
  const now = Date.now();
  if (readinessCache && readinessCache.expiresAt > now) return readinessCache.ready;
  if (readinessCheckInFlight) return readinessCheckInFlight;

  readinessCheckInFlight = runReadinessChecks().then((ready) => {
    readinessCache = { ready, expiresAt: Date.now() + READINESS_CACHE_TTL_MS };
    return ready;
  }).finally(() => {
    readinessCheckInFlight = null;
  });

  return readinessCheckInFlight;
}

export { app };
