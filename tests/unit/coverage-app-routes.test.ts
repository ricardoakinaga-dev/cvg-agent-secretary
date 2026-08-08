import { createHash, createHmac } from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';

const appMocks = vi.hoisted(() => ({
  eventStats: vi.fn(),
  auditEvents: vi.fn(),
  enqueue: vi.fn(),
  redisPing: vi.fn(async () => true),
  databaseCheck: vi.fn(async () => true),
}));

vi.mock('../../src/modules/analytics/index', () => ({
  analyticsService: { getEventStats: appMocks.eventStats },
}));
vi.mock('../../src/modules/audit/service', () => ({
  auditService: { getEvents: appMocks.auditEvents },
}));
vi.mock('../../src/modules/webhook/worker', () => ({
  chatwootWebhookWorker: { enqueue: appMocks.enqueue },
}));
vi.mock('../../src/shared/redis', () => ({
  redisClient: { ping: appMocks.redisPing },
}));
vi.mock('../../src/shared/db', () => ({
  checkDatabaseConnection: appMocks.databaseCheck,
}));
vi.mock('../../src/modules/knowledge/adminRoutes', async () => {
  const express = await vi.importActual<typeof import('express')>('express');
  return { knowledgeAdminRouter: express.Router() };
});
vi.mock('../../src/modules/scheduling/adminRoutes', async () => {
  const express = await vi.importActual<typeof import('express')>('express');
  return { schedulingAdminRouter: express.Router() };
});

import { app } from '../../src/app';
import { metrics } from '../../src/shared/metrics';

interface EventStats {
  totalEvents: number;
  conversationsStarted: number;
  conversationsEnded: number;
  handoffs: number;
  fallbacks: number;
  errors: number;
  avgResponseLatency: number;
}

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'x-api-key': 'test-admin-token', ...extra };
}

function stats(overrides: Partial<EventStats> = {}): EventStats {
  return {
    totalEvents: 20,
    conversationsStarted: 10,
    conversationsEnded: 8,
    handoffs: 2,
    fallbacks: 1,
    errors: 0,
    avgResponseLatency: 125,
    ...overrides,
  };
}

function signedWebhook(): { body: string; timestamp: string; signature: string; deliveryId: string } {
  const body = JSON.stringify({
    event: 'message_created',
    message: {
      id: 10,
      content: 'Preciso de ajuda',
      message_type: 'incoming',
      sender: { id: 99, name: 'Maria', type: 'contact' },
      attachments: [],
      private: false,
    },
    conversation: {
      id: 123,
      uuid: 'conversation-123',
      account_id: 1,
      inbox_id: 1,
      status: 'open',
      assignee_id: null,
      contact: { id: 99, name: 'Maria' },
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac('sha256', 'test-webhook-secret')
    .update(`${timestamp}.${body}`)
    .digest('hex')}`;
  return { body, timestamp, signature, deliveryId: 'chatwoot-delivery-123' };
}

describe('application reporting and failure branches', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    metrics.reset();
    appMocks.eventStats.mockResolvedValue(stats());
    appMocks.auditEvents.mockResolvedValue([]);
    appMocks.enqueue.mockResolvedValue({ id: 'job-1' });
  });

  it('returns a populated analytics dashboard with explicit period and provider rates', async () => {
    metrics.incrementCounter('analytics_messages_received');
    metrics.incrementCounter('analytics_responses_sent');
    metrics.incrementCounter('openai_requests_total');
    metrics.incrementCounter('openai_requests_total');
    metrics.incrementCounter('openai_requests_errors');
    metrics.incrementCounter('openrouter_requests_total');

    await withServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/analytics/dashboard?since=2026-07-01T00:00:00.000Z`,
        { headers: authHeaders() }
      );
      const body = await response.json() as Record<string, any>;

      expect(response.status).toBe(200);
      expect(appMocks.eventStats).toHaveBeenCalledWith(new Date('2026-07-01T00:00:00.000Z'));
      expect(body.summary).toMatchObject({
        conversations: { started: 10, ended: 8 },
        messages: { received: 1, sent: 1 },
        handoffs: { total: 2, rate: '20.00%' },
        performance: { avgResponseLatency: '125ms', autoResolutionRate: '75.00%' },
      });
      expect(body.providers).toEqual({
        openai: { requests: 2, errors: 1, errorRate: '50.00%' },
        openrouter: { requests: 1, errors: 0, errorRate: '0.00%' },
      });
    });
  });

  it('uses dashboard defaults and zero-safe rates', async () => {
    appMocks.eventStats.mockResolvedValue(stats({
      conversationsStarted: 0,
      conversationsEnded: 0,
      handoffs: 0,
    }));

    await withServer(async (baseUrl) => {
      const before = Date.now() - 24 * 60 * 60 * 1000 - 100;
      const response = await fetch(`${baseUrl}/api/analytics/dashboard`, { headers: authHeaders() });
      const body = await response.json() as Record<string, any>;

      expect(response.status).toBe(200);
      const [since] = appMocks.eventStats.mock.calls[0] as [Date];
      expect(since.getTime()).toBeGreaterThanOrEqual(before);
      expect(body.summary.handoffs.rate).toBe('0%');
      expect(body.summary.performance.autoResolutionRate).toBe('0%');
      expect(body.providers.openai.errorRate).toBe('0%');
      expect(body.providers.openrouter.errorRate).toBe('0%');
    });
  });

  it('maps analytics failures to a stable error response', async () => {
    appMocks.eventStats.mockRejectedValue(new Error('database unavailable'));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analytics/dashboard`, { headers: authHeaders() });
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: 'Failed to generate dashboard' });
    });
  });

  it('exports metrics as JSON, query-selected Prometheus, and Accept-selected Prometheus', async () => {
    metrics.incrementCounter('http.requests', { route: '/ready', result: 'ok' });
    metrics.setGauge('queue-depth', 3);
    metrics.recordHistogram('latency ms', 12, { worker: 'a' });

    await withServer(async (baseUrl) => {
      const jsonResponse = await fetch(`${baseUrl}/api/metrics`, {
        headers: authHeaders({ Accept: 'application/json' }),
      });
      const json = await jsonResponse.json() as Record<string, any>;
      expect(jsonResponse.status).toBe(200);
      expect(json.counters).toEqual(expect.objectContaining({
        'http.requests|[["result","ok"],["route","/ready"]]': 1,
      }));

      const queryResponse = await fetch(`${baseUrl}/api/metrics?format=prometheus`, {
        headers: authHeaders({ Accept: 'application/json' }),
      });
      expect(queryResponse.headers.get('content-type')).toContain('text/plain');
      await expect(queryResponse.text()).resolves.toContain(
        'http_requests{result="ok",route="/ready"} 1'
      );

      const acceptResponse = await fetch(`${baseUrl}/api/metrics`, {
        headers: authHeaders({ Accept: 'text/plain' }),
      });
      await expect(acceptResponse.text()).resolves.toContain('queue_depth 3');
    });
  });

  it('returns a stable metrics error for JSON and Prometheus failures', async () => {
    const allMetricsSpy = vi.spyOn(metrics, 'getAllMetrics').mockImplementation(() => {
      throw new Error('metrics unavailable');
    });

    await withServer(async (baseUrl) => {
      const jsonResponse = await fetch(`${baseUrl}/api/metrics`, {
        headers: authHeaders({ Accept: 'application/json' }),
      });
      expect(jsonResponse.status).toBe(500);
      await expect(jsonResponse.json()).resolves.toEqual({ error: 'Failed to get metrics' });

      allMetricsSpy.mockRestore();
      vi.spyOn(metrics, 'toPrometheus').mockImplementation(() => {
        throw new Error('serialization failed');
      });
      const textResponse = await fetch(`${baseUrl}/api/metrics?format=prometheus`, {
        headers: authHeaders(),
      });
      expect(textResponse.status).toBe(500);
    });
  });

  it('passes all supported audit filters and returns the event count', async () => {
    appMocks.auditEvents.mockResolvedValue([{ id: 'audit-1' }, { id: 'audit-2' }]);

    await withServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/audit/events?eventType=login&actor=manager-1&since=2026-07-01T00:00:00.000Z&limit=25`,
        { headers: authHeaders() }
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ count: 2 });
      expect(appMocks.auditEvents).toHaveBeenCalledWith({
        eventType: 'login',
        actor: 'manager-1',
        since: new Date('2026-07-01T00:00:00.000Z'),
        limit: 25,
      });
    });
  });

  it('maps audit lookup failures to a stable error response', async () => {
    appMocks.auditEvents.mockRejectedValue(new Error('audit unavailable'));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/audit/events`, { headers: authHeaders() });
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: 'Failed to get audit events' });
    });
  });

  it('builds the operational report KPIs, reliability, and degraded indicator', async () => {
    appMocks.eventStats.mockResolvedValue(stats({ errors: 3 }));
    metrics.incrementCounter('openai_requests_total');
    metrics.incrementCounter('openai_requests_total');
    metrics.incrementCounter('openai_requests_errors');
    metrics.incrementCounter('openrouter_requests_total');
    metrics.incrementCounter('openrouter_requests_total');

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/operational-report?days=14`, {
        headers: authHeaders(),
      });
      const body = await response.json() as Record<string, any>;
      expect(response.status).toBe(200);
      expect(body.period.days).toBe(14);
      expect(body.kpis).toEqual({
        conversationVolume: 10,
        autoResolutionRate: '75.0%',
        handoffRate: '20.0%',
        fallbackRate: '10.0%',
        avgResponseLatencyMs: 125,
      });
      expect(body.providers).toEqual({
        openai: { requests: 2, errors: 1, reliability: '50.0%' },
        openrouter: { requests: 2, errors: 0, reliability: '100.0%' },
      });
      expect(body.healthIndicators.systemStatus).toBe('degraded');
    });
  });

  it('uses report defaults, zero-safe rates, and healthy provider baselines', async () => {
    appMocks.eventStats.mockResolvedValue(stats({
      conversationsStarted: 0,
      conversationsEnded: 0,
      handoffs: 0,
      fallbacks: 0,
    }));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/operational-report?days=not-a-number`, {
        headers: authHeaders(),
      });
      const body = await response.json() as Record<string, any>;
      expect(body.period.days).toBe(7);
      expect(body.kpis).toMatchObject({
        autoResolutionRate: '0.0%',
        handoffRate: '0.0%',
        fallbackRate: '0.0%',
      });
      expect(body.providers.openai.reliability).toBe('100.0%');
      expect(body.providers.openrouter.reliability).toBe('100.0%');
      expect(body.healthIndicators.systemStatus).toBe('healthy');
    });
  });

  it('maps operational report failures to a stable error response', async () => {
    appMocks.eventStats.mockRejectedValue(new Error('stats unavailable'));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/operational-report`, { headers: authHeaders() });
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: 'Failed to generate operational report' });
    });
  });

  it('acknowledges duplicate webhook deliveries and preserves a supplied correlation id', async () => {
    appMocks.enqueue.mockResolvedValue(null);
    const webhook = signedWebhook();

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/webhooks/chatwoot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatwoot-signature': webhook.signature,
          'x-chatwoot-timestamp': webhook.timestamp,
          'x-chatwoot-delivery': webhook.deliveryId,
          'x-correlation-id': 'request-123',
        },
        body: webhook.body,
      });
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({ success: true, queued: false, duplicate: true });
      expect(appMocks.enqueue).toHaveBeenCalledWith(expect.any(Object), 'request-123', webhook.deliveryId);
    });
  });

  it('returns service unavailable when the webhook queue rejects a delivery', async () => {
    appMocks.enqueue.mockRejectedValue(new Error('redis unavailable'));
    const webhook = signedWebhook();

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/webhooks/chatwoot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatwoot-signature': webhook.signature,
          'x-chatwoot-timestamp': webhook.timestamp,
        },
        body: webhook.body,
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'Webhook queue unavailable',
      });
      expect(appMocks.enqueue).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        createHash('sha256')
          .update(webhook.timestamp)
          .update('.')
          .update(webhook.body)
          .digest('hex')
      );
    });
  });

  it('routes malformed JSON through the final error handler and handles unknown routes', async () => {
    await withServer(async (baseUrl) => {
      const malformed = await fetch(`${baseUrl}/webhooks/chatwoot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      });
      expect(malformed.status).toBe(500);
      await expect(malformed.json()).resolves.toEqual({
        success: false,
        error: 'Internal server error',
      });

      const missing = await fetch(`${baseUrl}/does-not-exist`);
      expect(missing.status).toBe(404);
      await expect(missing.json()).resolves.toEqual({ success: false, error: 'Not found' });
    });
  });
});
