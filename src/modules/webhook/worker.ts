import { randomUUID } from 'crypto';
import { analyticsService } from '../analytics';
import { logger } from '../logging';
import { processConversationCreated, processWebhookEvent } from '../runtime/agentRuntime';
import { redisClient } from '../../shared/redis';
import { ChatwootWebhookPayload } from '../../shared/types';
import { maskSensitiveData } from '../../shared/data-masking';
import { extractConversationMetadata } from '../chatwoot/normalizer';
import { conversationRepository } from '../conversations/repository';
import { metrics, METRICS } from '../../shared/metrics';

export interface QueuedChatwootWebhook {
  id: string;
  deliveryId: string;
  payload: ChatwootWebhookPayload;
  correlationId: string;
  enqueuedAt: string;
  attempts: number;
}

export interface FailedChatwootWebhook {
  id: string;
  correlationId: string;
  enqueuedAt: string;
  attempts: number;
  event: ChatwootWebhookPayload['event'];
  failedAt: string;
  error: string;
}

export interface WebhookQueueStore {
  enqueue(job: QueuedChatwootWebhook): Promise<boolean>;
  claim(ownerId: string, leaseDurationMs: number): Promise<QueuedChatwootWebhook | null>;
  ack(job: QueuedChatwootWebhook, ownerId: string): Promise<void>;
  renewLease(
    job: QueuedChatwootWebhook,
    ownerId: string,
    leaseDurationMs: number
  ): Promise<void>;
  requeue(
    job: QueuedChatwootWebhook,
    retry: QueuedChatwootWebhook,
    ownerId: string,
    delayMs: number
  ): Promise<void>;
  fail(
    job: QueuedChatwootWebhook,
    failed: FailedChatwootWebhook,
    ownerId: string
  ): Promise<void>;
  recoverExpired(): Promise<number>;
}

export interface WebhookWorkerOptions {
  pollIntervalMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  ownerId?: string;
  maxJobAgeMs?: number;
}

type WebhookProcessor = (
  payload: ChatwootWebhookPayload,
  correlationId: string
) => Promise<void>;

export class RedisWebhookQueueStore implements WebhookQueueStore {
  async enqueue(job: QueuedChatwootWebhook): Promise<boolean> {
    return redisClient.enqueueChatwootWebhookOnce(JSON.stringify(job), job.deliveryId);
  }

  async claim(ownerId: string, leaseDurationMs: number): Promise<QueuedChatwootWebhook | null> {
    const serialized = await redisClient.claimChatwootWebhook(ownerId, leaseDurationMs);
    return serialized ? JSON.parse(serialized) as QueuedChatwootWebhook : null;
  }

  async ack(job: QueuedChatwootWebhook, ownerId: string): Promise<void> {
    await redisClient.acknowledgeChatwootWebhook(job.id, ownerId);
  }

  async renewLease(
    job: QueuedChatwootWebhook,
    ownerId: string,
    leaseDurationMs: number
  ): Promise<void> {
    await redisClient.renewChatwootWebhookLease(job.id, ownerId, leaseDurationMs);
  }

  async requeue(
    job: QueuedChatwootWebhook,
    retry: QueuedChatwootWebhook,
    ownerId: string,
    delayMs: number
  ): Promise<void> {
    await redisClient.requeueChatwootWebhook(
      job.id,
      ownerId,
      JSON.stringify(retry),
      delayMs
    );
  }

  async fail(
    job: QueuedChatwootWebhook,
    failed: FailedChatwootWebhook,
    ownerId: string
  ): Promise<void> {
    await redisClient.failChatwootWebhook(job.id, ownerId, JSON.stringify(failed));
  }

  async recoverExpired(): Promise<number> {
    return redisClient.recoverExpiredChatwootWebhooks();
  }
}

export class ChatwootWebhookWorker {
  private readonly pollIntervalMs: number;
  private readonly retryDelayMs: number;
  private readonly maxAttempts: number;
  private readonly leaseDurationMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly ownerId: string;
  private readonly maxJobAgeMs: number;
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly store: WebhookQueueStore,
    private readonly processEvent: WebhookProcessor,
    options: WebhookWorkerOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs
      ?? Math.max(1, Math.floor(this.leaseDurationMs / 3));
    this.ownerId = options.ownerId ?? randomUUID();
    this.maxJobAgeMs = options.maxJobAgeMs ?? 24 * 60 * 60 * 1_000;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error('maxAttempts must be a positive integer');
    }
    if (!Number.isInteger(this.leaseDurationMs) || this.leaseDurationMs < 1) {
      throw new Error('leaseDurationMs must be a positive integer');
    }
    if (
      !Number.isInteger(this.heartbeatIntervalMs)
      || this.heartbeatIntervalMs < 1
      || this.heartbeatIntervalMs >= this.leaseDurationMs
    ) {
      throw new Error('heartbeatIntervalMs must be a positive integer below leaseDurationMs');
    }
    if (!this.ownerId) {
      throw new Error('ownerId is required');
    }
    if (!Number.isInteger(this.maxJobAgeMs) || this.maxJobAgeMs < 1) {
      throw new Error('maxJobAgeMs must be a positive integer');
    }
  }

  async enqueue(
    payload: ChatwootWebhookPayload,
    correlationId: string,
    deliveryId: string
  ): Promise<QueuedChatwootWebhook | null> {
    const job: QueuedChatwootWebhook = {
      id: randomUUID(),
      deliveryId,
      payload,
      correlationId,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    };
    if (await this.store.enqueue(job)) {
      metrics.incrementCounter(METRICS.WEBHOOK_ENQUEUED_TOTAL);
      return job;
    }
    metrics.incrementCounter(METRICS.WEBHOOK_DUPLICATES_TOTAL);
    return null;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const recovered = await this.store.recoverExpired();
    if (recovered > 0) {
      metrics.addCounter(METRICS.WEBHOOK_RECOVERED_TOTAL, recovered);
      logger.warn('Recovered inflight Chatwoot webhooks', { recovered });
    }

    this.running = true;
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loopPromise;
    this.loopPromise = null;
  }

  async processNext(): Promise<boolean> {
    const job = await this.store.claim(this.ownerId, this.leaseDurationMs);
    if (!job) {
      return false;
    }
    const processingStartedAt = Date.now();

    const enqueuedAt = Date.parse(job.enqueuedAt);
    if (!Number.isFinite(enqueuedAt) || Date.now() - enqueuedAt > this.maxJobAgeMs) {
      metrics.incrementCounter(METRICS.WEBHOOK_EXPIRED_TOTAL);
      await this.store.fail(job, {
        id: job.id,
        correlationId: job.correlationId,
        enqueuedAt: job.enqueuedAt,
        attempts: job.attempts,
        event: job.payload.event,
        failedAt: new Date().toISOString(),
        error: 'Webhook expired before processing',
      }, this.ownerId);
      logger.warn('Expired Chatwoot webhook removed before processing', {
        webhookJobId: job.id,
        correlationId: job.correlationId,
      });
      this.recordProcessingMetrics('expired', processingStartedAt);
      return true;
    }
    metrics.recordHistogram(METRICS.WEBHOOK_QUEUE_AGE_MS, Math.max(0, Date.now() - enqueuedAt));

    const stopHeartbeat = this.startLeaseHeartbeat(job);
    try {
      let processingSucceeded = false;
      let processingError: unknown;
      try {
        await this.processEvent(job.payload, job.correlationId);
        processingSucceeded = true;
      } catch (error) {
        processingError = error;
      }

      if (processingSucceeded) {
        await this.store.ack(job, this.ownerId);
        this.recordProcessingMetrics('success', processingStartedAt);
        return true;
      }

      const error = processingError;
      metrics.incrementCounter(METRICS.WEBHOOK_PROCESSING_ERRORS_TOTAL, {
        stage: 'processor',
      });
      const retry = { ...job, attempts: job.attempts + 1 };
      const errorMessage = maskSensitiveData(
        error instanceof Error ? error.message : String(error)
      );
      logger.error('Chatwoot webhook processing failed', error as Error, {
        webhookJobId: job.id,
        attempts: retry.attempts,
        correlationId: job.correlationId,
      });

      if (retry.attempts >= this.maxAttempts) {
        const failed: FailedChatwootWebhook = {
          id: retry.id,
          correlationId: retry.correlationId,
          enqueuedAt: retry.enqueuedAt,
          attempts: retry.attempts,
          event: retry.payload.event,
          failedAt: new Date().toISOString(),
          error: errorMessage,
        };

        try {
          await this.store.fail(job, failed, this.ownerId);
          metrics.incrementCounter(METRICS.WEBHOOK_DLQ_TOTAL);
          this.recordProcessingMetrics('dead_letter', processingStartedAt);
          logger.error('Chatwoot webhook moved to dead-letter queue', error as Error, {
            webhookJobId: job.id,
            attempts: retry.attempts,
            correlationId: job.correlationId,
          });
        } catch (deadLetterError) {
          metrics.incrementCounter(METRICS.WEBHOOK_PROCESSING_ERRORS_TOTAL, {
            stage: 'dead_letter',
          });
          this.recordProcessingMetrics('lease_lost', processingStartedAt);
          logger.error('Failed to dead-letter Chatwoot webhook; lease will expire or ownership was lost', deadLetterError as Error, {
            webhookJobId: job.id,
            correlationId: job.correlationId,
          });
        }
      } else {
        try {
          await this.store.requeue(job, retry, this.ownerId, this.retryDelayMs);
          metrics.incrementCounter(METRICS.WEBHOOK_RETRIES_TOTAL);
          this.recordProcessingMetrics('retry', processingStartedAt);
        } catch (requeueError) {
          metrics.incrementCounter(METRICS.WEBHOOK_PROCESSING_ERRORS_TOTAL, {
            stage: 'requeue',
          });
          this.recordProcessingMetrics('lease_lost', processingStartedAt);
          logger.error('Failed to requeue Chatwoot webhook; lease will expire or ownership was lost', requeueError as Error, {
            webhookJobId: job.id,
            correlationId: job.correlationId,
          });
        }
      }

      return true;
    } finally {
      await stopHeartbeat();
    }
  }

  private recordProcessingMetrics(
    outcome: 'success' | 'retry' | 'dead_letter' | 'expired' | 'lease_lost',
    startedAt: number
  ): void {
    metrics.incrementCounter(METRICS.WEBHOOK_PROCESSING_TOTAL, { outcome });
    metrics.recordHistogram(
      METRICS.WEBHOOK_PROCESSING_LATENCY_MS,
      Math.max(0, Date.now() - startedAt),
      { outcome }
    );
  }

  private startLeaseHeartbeat(job: QueuedChatwootWebhook): () => Promise<void> {
    const activeRenewals = new Set<Promise<void>>();
    const timer = setInterval(() => {
      const renewal = this.store
        .renewLease(job, this.ownerId, this.leaseDurationMs)
        .catch((error) => {
          logger.error('Failed to renew Chatwoot webhook visibility lease', error as Error, {
            webhookJobId: job.id,
            correlationId: job.correlationId,
          });
        });
      activeRenewals.add(renewal);
      void renewal.finally(() => activeRenewals.delete(renewal));
    }, this.heartbeatIntervalMs);

    return async () => {
      clearInterval(timer);
      await Promise.allSettled([...activeRenewals]);
    };
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        const processed = await this.processNext();
        if (!processed) {
          await delay(this.pollIntervalMs);
        }
      } catch (error) {
        logger.error('Chatwoot webhook worker loop failed', error as Error);
        await delay(this.retryDelayMs);
      }
    }
  }
}

export async function dispatchChatwootWebhook(
  payload: ChatwootWebhookPayload,
  correlationId: string
): Promise<void> {
  const log = logger.child({ correlationId });

  switch (payload.event) {
    case 'message_created':
      await processWebhookEvent(payload, correlationId);
      break;

    case 'conversation_created':
      await processConversationCreated(payload);
      break;

    case 'conversation_status_changed':
      await processConversationStatusChanged(payload, correlationId);
      break;

    case 'conversation_updated':
    case 'message_updated':
      log.info(`Event ${payload.event} received but not processed`);
      break;

    default:
      log.warn(`Unknown event type: ${String(payload.event)}`);
  }
}

async function processConversationStatusChanged(
  payload: ChatwootWebhookPayload,
  correlationId: string
): Promise<void> {
  const conversationId = String(payload.conversation?.id);
  const newStatus = payload.conversation?.status;
  const log = logger.child({ correlationId, event: 'conversation_status_changed' });

  log.info('Conversation status changed', { conversationId, newStatus });

  const metadata = extractConversationMetadata(payload);
  await conversationRepository.upsertConversation({
    chatwootConversationId: metadata.chatwootConversationId,
    chatwootContactId: metadata.chatwootContactId,
    contactName: metadata.contactName,
    status: metadata.status as 'open' | 'pending' | 'resolved' | 'closed',
  });

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
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export const chatwootWebhookWorker = new ChatwootWebhookWorker(
  new RedisWebhookQueueStore(),
  dispatchChatwootWebhook
);
