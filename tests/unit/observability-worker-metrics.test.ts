import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatwootWebhookWorker,
  QueuedChatwootWebhook,
  WebhookQueueStore,
} from '../../src/modules/webhook/worker';
import { METRICS, metrics } from '../../src/shared/metrics';
import { ChatwootWebhookPayload } from '../../src/shared/types';

function job(): QueuedChatwootWebhook {
  return {
    id: 'job-1',
    deliveryId: 'a'.repeat(64),
    correlationId: 'correlation-1',
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    payload: { event: 'message_created' } as ChatwootWebhookPayload,
  };
}

function storeWithClaim(claimed: QueuedChatwootWebhook | null): WebhookQueueStore {
  return {
    enqueue: vi.fn().mockResolvedValue(true),
    claim: vi.fn().mockResolvedValue(claimed),
    ack: vi.fn().mockResolvedValue(undefined),
    renewLease: vi.fn().mockResolvedValue(undefined),
    requeue: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    recoverExpired: vi.fn().mockResolvedValue(0),
  };
}

describe('webhook worker operational metrics', () => {
  beforeEach(() => metrics.reset());

  it('records successful processing and latency without identifier labels', async () => {
    const worker = new ChatwootWebhookWorker(
      storeWithClaim(job()),
      vi.fn().mockResolvedValue(undefined),
      { ownerId: 'worker-a', leaseDurationMs: 1_000, heartbeatIntervalMs: 500 }
    );

    await worker.processNext();

    expect(metrics.getCounter(METRICS.WEBHOOK_PROCESSING_TOTAL, {
      outcome: 'success',
    })).toBe(1);
    expect(metrics.getHistogramValues(METRICS.WEBHOOK_PROCESSING_LATENCY_MS, {
      outcome: 'success',
    })).toHaveLength(1);
    expect(metrics.toPrometheus()).not.toMatch(/job|correlation|tenant|conversation/);
  });

  it('records processor errors and retry outcomes', async () => {
    const worker = new ChatwootWebhookWorker(
      storeWithClaim(job()),
      vi.fn().mockRejectedValue(new Error('private payload')),
      { ownerId: 'worker-a', maxAttempts: 2, leaseDurationMs: 1_000, heartbeatIntervalMs: 500 }
    );

    await worker.processNext();

    expect(metrics.getCounter(METRICS.WEBHOOK_PROCESSING_ERRORS_TOTAL, {
      stage: 'processor',
    })).toBe(1);
    expect(metrics.getCounter(METRICS.WEBHOOK_PROCESSING_TOTAL, {
      outcome: 'retry',
    })).toBe(1);
  });

  it('adds recovered jobs to a cumulative counter', async () => {
    const store = storeWithClaim(null);
    vi.mocked(store.recoverExpired).mockResolvedValue(3);
    const worker = new ChatwootWebhookWorker(
      store,
      vi.fn(),
      {
        ownerId: 'worker-a',
        pollIntervalMs: 1,
        leaseDurationMs: 1_000,
        heartbeatIntervalMs: 500,
      }
    );

    await worker.start();
    await worker.stop();

    expect(metrics.getCounter(METRICS.WEBHOOK_RECOVERED_TOTAL)).toBe(3);
  });
});
