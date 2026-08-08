import { randomUUID } from 'crypto';
import { analyticsService } from '../analytics';
import { logger } from '../logging';
import { processConversationCreated, processWebhookEvent } from '../runtime/agentRuntime';
import { redisClient } from '../../shared/redis';
import { ChatwootWebhookPayload } from '../../shared/types';
import { maskSensitiveData } from '../../shared/data-masking';
import {
  extractConversationMetadata,
  getWebhookMessage,
  isRelevantEvent,
} from '../chatwoot/normalizer';
import { chatwootClient } from '../chatwoot/client';
import { config } from '../../config';
import { conversationRepository } from '../conversations/repository';
import { metrics, METRICS } from '../../shared/metrics';
import { InboundReceipt, InboundReceiptRepository, inboundReceiptRepository } from './inboxRepository';

export interface QueuedChatwootWebhook {
  id: string;
  receiptId?: string;
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
  failureClass: WebhookFailureClass;
}

export type WebhookFailureClass = 'contention' | 'transient' | 'permanent';

export interface WebhookQueueStore {
  enqueue(job: QueuedChatwootWebhook): Promise<boolean>;
  enqueueReplay?(job: QueuedChatwootWebhook): Promise<boolean>;
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
  maxRetryDelayMs?: number;
  orderingRetryDelayMs?: number;
}

type WebhookProcessor = (
  payload: ChatwootWebhookPayload,
  correlationId: string,
  receiptId?: string
) => Promise<void>;

export class RedisWebhookQueueStore implements WebhookQueueStore {
  async enqueue(job: QueuedChatwootWebhook): Promise<boolean> {
    return redisClient.enqueueChatwootWebhookOnce(JSON.stringify(job), job.deliveryId);
  }

  async enqueueReplay(job: QueuedChatwootWebhook): Promise<boolean> {
    if (!job.receiptId) return this.enqueue(job);
    return redisClient.enqueueChatwootWebhookReplay(JSON.stringify(job), job.receiptId);
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
  private readonly maxRetryDelayMs: number;
  private readonly orderingRetryDelayMs: number;
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly store: WebhookQueueStore,
    private readonly processEvent: WebhookProcessor,
    options: WebhookWorkerOptions = {},
    private readonly receipts?: InboundReceiptRepository
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs
      ?? Math.max(1, Math.floor(this.leaseDurationMs / 3));
    this.ownerId = options.ownerId ?? randomUUID();
    this.maxJobAgeMs = options.maxJobAgeMs ?? 24 * 60 * 60 * 1_000;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 60_000;
    this.orderingRetryDelayMs = options.orderingRetryDelayMs ?? 250;
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
    if (!Number.isInteger(this.maxRetryDelayMs) || this.maxRetryDelayMs < 0) {
      throw new Error('maxRetryDelayMs must be a non-negative integer');
    }
    if (!Number.isInteger(this.orderingRetryDelayMs) || this.orderingRetryDelayMs < 1) {
      throw new Error('orderingRetryDelayMs must be a positive integer');
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  async enqueue(
    payload: ChatwootWebhookPayload,
    correlationId: string,
    deliveryId: string
  ): Promise<QueuedChatwootWebhook | null> {
    const accepted = this.receipts
      ? await this.receipts.accept({ deliveryId, payload, correlationId })
      : null;

    if (accepted && accepted.duplicate && ['processed', 'dead_letter'].includes(accepted.receipt.status)) {
      metrics.incrementCounter(METRICS.WEBHOOK_DUPLICATES_TOTAL);
      metrics.incrementCounter(METRICS.INBOUND_RECEIPTS_TOTAL, { outcome: 'duplicate_terminal' });
      return null;
    }

    const job: QueuedChatwootWebhook = {
      id: accepted?.receipt.id || randomUUID(),
      receiptId: accepted?.receipt.id,
      deliveryId: accepted?.receipt.deliveryId || deliveryId,
      payload: accepted?.receipt.payload || payload,
      correlationId: accepted?.receipt.correlationId || correlationId,
      enqueuedAt: accepted?.receipt.createdAt.toISOString() || new Date().toISOString(),
      attempts: accepted?.receipt.attempts || 0,
    };
    const enqueued = accepted?.duplicate
      ? await this.enqueueDurableJob(job)
      : await this.store.enqueue(job);
    if (enqueued) {
      if (this.receipts && job.receiptId) {
        await this.receipts.markQueued(job.receiptId, this.ownerId);
      }
      metrics.incrementCounter(METRICS.WEBHOOK_ENQUEUED_TOTAL);
      metrics.incrementCounter(METRICS.INBOUND_RECEIPTS_TOTAL, {
        outcome: accepted?.duplicate ? 'duplicate_recovered' : 'accepted',
      });
      return job;
    }
    metrics.incrementCounter(METRICS.WEBHOOK_DUPLICATES_TOTAL);
    metrics.incrementCounter(METRICS.INBOUND_RECEIPTS_TOTAL, { outcome: 'queue_duplicate' });
    return null;
  }

  async listDeadLetters(limit = 100): Promise<InboundReceipt[]> {
    if (!this.receipts) return [];
    return this.receipts.findDeadLetters(limit);
  }

  async replayDeadLetter(
    receiptId: string,
    actor = 'manual-replay'
  ): Promise<QueuedChatwootWebhook> {
    if (!this.receipts) throw new Error('Durable inbound receipts are not configured');
    const receipt = await this.receipts.requeueDeadLetter(receiptId, actor);
    if (!receipt) throw new Error('Dead-letter receipt was not found or was already replayed');
    const job = this.jobFromReceipt(receipt);
    if (!(await this.enqueueDurableJob(job))) {
      throw new Error('Dead-letter receipt could not be queued for replay');
    }
    await this.receipts.markQueued(receipt.id, actor);
    metrics.incrementCounter(METRICS.WEBHOOK_RECOVERED_TOTAL, { source: 'manual_replay' });
    return job;
  }

  async cancelDeadLetter(
    receiptId: string,
    reason: string,
    actor = 'operator'
  ): Promise<void> {
    if (!this.receipts) throw new Error('Durable inbound receipts are not configured');
    const annotated = await this.receipts.annotateDeadLetter(
      receiptId,
      `cancelled: ${reason}`,
      actor
    );
    if (!annotated) throw new Error('Dead-letter receipt was not found or is no longer cancellable');
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

    await this.requeueDurableReceipts();

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

    let durableReceipt: InboundReceipt | null = null;
    if (this.receipts && job.receiptId) {
      durableReceipt = await this.receipts.getById(job.receiptId);
      if (durableReceipt?.status === 'processed' || durableReceipt?.status === 'dead_letter') {
        await this.store.ack(job, this.ownerId);
        metrics.incrementCounter(METRICS.WEBHOOK_DUPLICATES_TOTAL);
        this.recordProcessingMetrics('success', processingStartedAt);
        return true;
      }
    }

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
        failureClass: 'permanent',
      }, this.ownerId);
      if (this.receipts && job.receiptId) {
        await this.receipts.markDeadLetter(job.receiptId, 'Webhook expired before processing');
      }
      logger.warn('Expired Chatwoot webhook removed before processing', {
        webhookJobId: job.id,
        correlationId: job.correlationId,
      });
      this.recordProcessingMetrics('expired', processingStartedAt);
      return true;
    }
    metrics.recordHistogram(METRICS.WEBHOOK_QUEUE_AGE_MS, Math.max(0, Date.now() - enqueuedAt));

    // Redis arrival order is not a source-of-truth ordering guarantee. When a
    // newer event wins the queue race, return it to the delayed queue without
    // consuming an attempt until all earlier durable receipts for the same
    // conversation have finished.
    if (
      this.receipts
      && job.receiptId
      && durableReceipt
      && this.receipts.hasEarlierUnfinished
      && await this.receipts.hasEarlierUnfinished(job.receiptId)
    ) {
      await this.store.requeue(
        job,
        { ...job },
        this.ownerId,
        this.orderingRetryDelayMs
      );
      metrics.incrementCounter(METRICS.WEBHOOK_RETRIES_TOTAL, { reason: 'conversation_ordering' });
      this.recordProcessingMetrics('retry', processingStartedAt);
      logger.debug('Chatwoot webhook delayed until earlier conversation events finish', {
        webhookJobId: job.id,
        correlationId: job.correlationId,
      });
      return true;
    }

    const stopHeartbeat = this.startLeaseHeartbeat(job);
    try {
      let processingSucceeded = false;
      let processingError: unknown;
      try {
        if (this.receipts && job.receiptId) {
          const claimedReceipt = await this.receipts.markProcessing(
            job.receiptId,
            this.ownerId,
            this.leaseDurationMs
          );
          if (!claimedReceipt) {
            await this.store.ack(job, this.ownerId);
            metrics.incrementCounter(METRICS.WEBHOOK_DUPLICATES_TOTAL);
            this.recordProcessingMetrics('success', processingStartedAt);
            return true;
          }
        }
        await confirmInboundMessageIfConfigured(job.payload);
        if (job.receiptId) {
          await this.processEvent(job.payload, job.correlationId, job.receiptId);
        } else {
          await this.processEvent(job.payload, job.correlationId);
        }
        if (this.receipts && job.receiptId) {
          await this.receipts.markProcessed(job.receiptId, this.ownerId);
        }
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
      const failureClass = classifyWebhookError(error);
      metrics.incrementCounter(METRICS.WEBHOOK_PROCESSING_ERRORS_TOTAL, {
        stage: 'processor',
        failure_class: failureClass,
      });
      logger.error('Chatwoot webhook processing failed', error as Error, {
        webhookJobId: job.id,
        attempts: retry.attempts,
        correlationId: job.correlationId,
        failureClass,
      });

      const shouldDeadLetter = failureClass === 'permanent'
        || (retry.attempts >= this.maxAttempts && failureClass !== 'contention');
      if (shouldDeadLetter) {
        const failed: FailedChatwootWebhook = {
          id: retry.id,
          correlationId: retry.correlationId,
          enqueuedAt: retry.enqueuedAt,
          attempts: retry.attempts,
          event: retry.payload.event,
          failedAt: new Date().toISOString(),
          error: errorMessage,
          failureClass,
        };

        try {
          await this.store.fail(job, failed, this.ownerId);
          if (this.receipts && job.receiptId) {
            await this.receipts.markDeadLetter(job.receiptId, errorMessage, this.ownerId);
          }
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
          const delayMs = this.retryDelayForAttempt(retry.attempts);
          if (this.receipts && job.receiptId) {
            await this.receipts.markRetry(job.receiptId, errorMessage, delayMs, this.ownerId);
          }
          await this.store.requeue(job, retry, this.ownerId, delayMs);
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
      const queueRenewal = this.store
        .renewLease(job, this.ownerId, this.leaseDurationMs)
        .catch((error) => {
          logger.error('Failed to renew Chatwoot webhook visibility lease', error as Error, {
            webhookJobId: job.id,
            correlationId: job.correlationId,
          });
        });
      activeRenewals.add(queueRenewal);
      void queueRenewal.finally(() => activeRenewals.delete(queueRenewal));

      if (this.receipts && job.receiptId) {
        const receiptRenewal = this.receipts
          .renewProcessing(job.receiptId, this.ownerId, this.leaseDurationMs)
          .then((renewed) => {
            if (!renewed) {
              logger.warn('Inbound receipt processing lease was lost', {
                webhookJobId: job.id,
                receiptId: job.receiptId,
                correlationId: job.correlationId,
              });
            }
          })
          .catch((error) => {
            logger.error('Failed to renew inbound receipt processing lease', error as Error, {
              webhookJobId: job.id,
              receiptId: job.receiptId,
              correlationId: job.correlationId,
            });
          });
        activeRenewals.add(receiptRenewal);
        void receiptRenewal.finally(() => activeRenewals.delete(receiptRenewal));
      }
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

  private async requeueDurableReceipts(): Promise<void> {
    if (!this.receipts) return;
    const receipts = await this.receipts.findRecoverable();
    for (const receipt of receipts) {
      const job = this.jobFromReceipt(receipt);
      if (await this.enqueueDurableJob(job)) {
        await this.receipts.markQueued(receipt.id, this.ownerId);
      }
    }
  }

  private jobFromReceipt(receipt: InboundReceipt): QueuedChatwootWebhook {
    return {
      id: receipt.id,
      receiptId: receipt.id,
      deliveryId: receipt.deliveryId,
      payload: receipt.payload,
      correlationId: receipt.correlationId,
      enqueuedAt: receipt.createdAt.toISOString(),
      attempts: receipt.attempts,
    };
  }

  private async enqueueDurableJob(job: QueuedChatwootWebhook): Promise<boolean> {
    return this.store.enqueueReplay
      ? this.store.enqueueReplay(job)
      : this.store.enqueue(job);
  }

  private retryDelayForAttempt(attempt: number): number {
    if (this.retryDelayMs <= 0) return 0;
    const exponent = Math.max(0, Math.min(attempt - 1, 10));
    return Math.min(this.maxRetryDelayMs, this.retryDelayMs * (2 ** exponent));
  }
}

function isConversationContentionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /conversation (?:is already being processed|lock was lost)/i.test(message)
    || /response intent is already being delivered/i.test(message);
}

export function classifyWebhookError(error: unknown): WebhookFailureClass {
  if (isConversationContentionError(error)) return 'contention';

  if (error && typeof error === 'object') {
    const candidate = error as {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      name?: unknown;
      retryable?: unknown;
      permanent?: unknown;
    };
    if (candidate.permanent === true || candidate.retryable === false) return 'permanent';

    const status = typeof candidate.status === 'number'
      ? candidate.status
      : typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined;
    if (status !== undefined) {
      if (status === 400 || status === 401 || status === 403 || status === 422) return 'permanent';
      if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
        return 'transient';
      }
    }

    if (candidate.name === 'ZodError' || candidate.name === 'ValidationError') return 'permanent';
    if (candidate.code === 'ERR_INVALID_ARG_TYPE' || candidate.code === 'ERR_INVALID_URL') {
      return 'permanent';
    }
  }

  // Unknown failures remain retryable. The max-attempt and max-age controls
  // still bound them, while avoiding data loss for provider/network errors
  // whose shape is not under our control.
  return 'transient';
}

async function confirmInboundMessageIfConfigured(payload: ChatwootWebhookPayload): Promise<void> {
  if (!config.chatwoot.confirmInboundMessages || !isRelevantEvent(payload)) return;
  const message = getWebhookMessage(payload);
  if (!message) return;
  const confirmed = await chatwootClient.findMessageById(
    payload.conversation.id,
    message.id
  );
  const confirmedType = confirmed?.message_type;
  const isIncoming = confirmedType === 'incoming' || confirmedType === 0;
  if (!confirmed || !isIncoming || confirmed.private === true) {
    throw new Error('Inbound Chatwoot message was not found during independent confirmation');
  }
}

export async function dispatchChatwootWebhook(
  payload: ChatwootWebhookPayload,
  correlationId: string,
  receiptId?: string
): Promise<void> {
  const log = logger.child({ correlationId });

  switch (payload.event) {
    case 'message_created':
      if (receiptId) {
        await processWebhookEvent(payload, correlationId, receiptId);
      } else {
        await processWebhookEvent(payload, correlationId);
      }
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
  dispatchChatwootWebhook,
  {},
  inboundReceiptRepository
);
