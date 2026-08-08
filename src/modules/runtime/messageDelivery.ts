import { redisClient } from '../../shared/redis';
import { chatwootClient } from '../chatwoot/client';
import { conversationRepository } from '../conversations/repository';
import { responseOutboxRepository } from './responseOutboxRepository';
import { metrics, METRICS } from '../../shared/metrics';
import { randomUUID } from 'node:crypto';
import { maskSensitiveData } from '../../shared/data-masking';
import type { IdempotencyLookupOptions } from '../chatwoot/client';

interface IdempotentChatwootClient {
  sendMessageWithIdempotency?: (params: {
    conversationId: number;
    content: string;
    idempotencyKey: string;
  }) => Promise<{ id: number }>;
  findMessageByIdempotencyKey?: (
    conversationId: number,
    idempotencyKey: string,
    content: string,
    createdAfter: Date,
    options?: IdempotencyLookupOptions
  ) => Promise<{ id: number } | null>;
}

/**
 * Delivers and records one bot response. The outgoing-content marker is
 * written before the external call so the corresponding Chatwoot webhook is
 * not mistaken for a human takeover.
 */
export async function sendBotMessage(
  chatwootConversationId: number,
  persistedConversationId: string,
  content: string,
  inboundChatwootMessageId?: number,
  correlationId?: string
): Promise<void> {
  const idempotentClient = chatwootClient as typeof chatwootClient & IdempotentChatwootClient;
  // Keep the legacy branch only for isolated unit-test doubles and callers
  // that have not yet supplied the inbound message identity. The production
  // Chatwoot client always exposes the idempotent method and runtime calls
  // always provide the inbound Chatwoot message ID.
  if (
    !idempotentClient.sendMessageWithIdempotency
    || !Number.isSafeInteger(inboundChatwootMessageId)
  ) {
    await redisClient.markBotOutgoingContent(chatwootConversationId, content);
    const sentMessage = await chatwootClient.sendMessage({
      conversationId: chatwootConversationId,
      content,
    });
    await conversationRepository.saveMessage({
      conversationId: persistedConversationId,
      chatwootMessageId: sentMessage.id,
      content,
      messageType: 'outgoing',
      senderType: 'bot',
      senderName: 'CVG Secretary Agent',
      createdAt: new Date(),
    });
    await redisClient.markBotOutgoingMessageId(sentMessage.id);
    return;
  }

  const inboundMessageId = inboundChatwootMessageId as number;

  const intent = await responseOutboxRepository.createOrGet({
    conversationId: persistedConversationId,
    chatwootConversationId,
    inboundChatwootMessageId: inboundMessageId,
    content,
    correlationId,
  });
  metrics.incrementCounter(METRICS.RESPONSE_OUTBOX_TOTAL, { status: intent.status });

  if (intent.status === 'sent' || intent.status === 'reconciled') {
    metrics.incrementCounter(METRICS.RESPONSE_OUTBOX_DUPLICATES_TOTAL, { status: intent.status });
    if (intent.chatwootMessageId !== null) {
      await persistOutgoingMessage(
        persistedConversationId,
        intent.chatwootMessageId,
        intent.content
      );
    }
    return;
  }

  if (intent.status === 'unknown') {
    const reconciled = await idempotentClient.findMessageByIdempotencyKey?.(
      chatwootConversationId,
      intent.idempotencyKey,
      intent.content,
      intent.createdAt
    );
    if (reconciled) {
      metrics.incrementCounter(METRICS.RESPONSE_OUTBOX_RECONCILED_TOTAL);
      const resolved = await responseOutboxRepository.markReconciled(
        intent.id,
        reconciled.id,
        `runtime:${intent.id}`
      );
      await persistOutgoingMessage(
        persistedConversationId,
        resolved.chatwootMessageId || reconciled.id,
        resolved.content
      );
      await redisClient.markBotOutgoingMessageId(reconciled.id);
      return;
    }

    throw new Error('Chatwoot response delivery is unknown and requires reconciliation');
  }

  const owner = `runtime:${intent.id}`;
  const claimed = await responseOutboxRepository.claimForSend(intent.id, owner, 30_000);
  if (!claimed) {
    throw new Error('Chatwoot response intent is already being delivered');
  }

  await redisClient.markBotOutgoingContent(chatwootConversationId, claimed.content);
  try {
    const sentMessage = await idempotentClient.sendMessageWithIdempotency({
      conversationId: chatwootConversationId,
      content: claimed.content,
      idempotencyKey: claimed.idempotencyKey,
    });
    const sentIntent = await responseOutboxRepository.markSent(
      claimed.id,
      sentMessage.id,
      owner
    );
    await persistOutgoingMessage(
      persistedConversationId,
      sentIntent.chatwootMessageId || sentMessage.id,
      sentIntent.content
    );
    await redisClient.markBotOutgoingMessageId(sentMessage.id);
  } catch (error) {
    metrics.incrementCounter(METRICS.RESPONSE_OUTBOX_UNKNOWN_TOTAL);
    try {
      await responseOutboxRepository.markUnknown(
        claimed.id,
        maskSensitiveData(error instanceof Error ? error.message : String(error)),
        owner
      );
    } catch {
      // Preserve the external delivery error. The outbox remains recoverable
      // through the lease/unknown reconciliation path when the DB is healthy.
    }
    throw error;
  }
}

export async function reconcileUnknownResponseIntents(limit = 100): Promise<number> {
  const client = chatwootClient as typeof chatwootClient & IdempotentChatwootClient;
  if (!client.findMessageByIdempotencyKey) return 0;
  await responseOutboxRepository.recoverStaleSending(limit);
  const intents = await responseOutboxRepository.findUnknown(limit);
  let reconciledCount = 0;

  for (const intent of intents) {
    const owner = `reconciler:${randomUUID()}`;
    const claimed = await responseOutboxRepository.claimUnknown(intent.id, owner, 30_000);
    if (!claimed) continue;
    try {
      const external = await client.findMessageByIdempotencyKey(
        claimed.chatwootConversationId,
        claimed.idempotencyKey,
        claimed.content,
        claimed.createdAt
      );
      if (external) {
        const resolved = await responseOutboxRepository.markReconciled(
          claimed.id,
          external.id,
          owner
        );
        await persistOutgoingMessage(
          resolved.conversationId,
          external.id,
          resolved.content
        );
        await redisClient.markBotOutgoingMessageId(external.id);
        metrics.incrementCounter(METRICS.RESPONSE_OUTBOX_RECONCILED_TOTAL);
        reconciledCount += 1;
      } else {
        await responseOutboxRepository.markUnknown(
          claimed.id,
          'Reconciliation did not find the external response',
          owner
        );
      }
    } catch (error) {
      try {
        await responseOutboxRepository.markUnknown(
          claimed.id,
          maskSensitiveData(error instanceof Error ? error.message : String(error)),
          owner
        );
      } catch {
        // The lease remains recoverable by the next reconciliation pass.
      }
    }
  }

  return reconciledCount;
}

async function persistOutgoingMessage(
  persistedConversationId: string,
  chatwootMessageId: number,
  content: string
): Promise<void> {
  await conversationRepository.saveMessage({
    conversationId: persistedConversationId,
    chatwootMessageId,
    content,
    messageType: 'outgoing',
    senderType: 'bot',
    senderName: 'CVG Secretary Agent',
    createdAt: new Date(),
  });
}
