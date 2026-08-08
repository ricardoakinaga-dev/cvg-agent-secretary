import { redisClient } from '../../shared/redis';
import { ChatwootWebhookPayload } from '../../shared/types';
import {
  extractConversationMetadata,
  getWebhookMessage,
  isOutgoingMessage,
} from '../chatwoot/normalizer';
import {
  loadConversationContext,
  updateConversationState,
} from '../conversations/contextLoader';
import { logger } from '../logging';
import { responseOutboxRepository } from './responseOutboxRepository';
import { conversationRepository } from '../conversations/repository';
import { handoffRepository } from '../handoff/repository';
import { config } from '../../config';

type RuntimeLogger = ReturnType<typeof logger.child>;

function normalizeForTakeoverDetection(content: string): string {
  return content
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function looksLikeHumanOperatorMessage(content: string): boolean {
  const text = normalizeForTakeoverDetection(content);

  return [
    /\bsou\s+(?:do|da)\s+centro\s+veterinario\s+guarapiranga\b/,
    /\baqui\s+(?:e|é)\s+(?:do|da)\s+centro\s+veterinario\s+guarapiranga\b/,
    /\bcentro\s+veterinario\s+guarapiranga\b.*\b(?:posso|podemos)\s+ajudar\b/,
    /\b(?:posso|podemos)\s+ajudar\b.*\bcentro\s+veterinario\s+guarapiranga\b/,
    /\bsou\s+(?:atendente|recepcionista|veterinari[oa])\b/,
    /\bno\s+que\s+(?:posso|podemos)\s+ajudar\b/,
  ].some(pattern => pattern.test(text));
}

export async function pauseConversationForHumanTakeover(
  payload: ChatwootWebhookPayload,
  log: RuntimeLogger,
  reason: string
): Promise<void> {
  const metadata = extractConversationMetadata(payload);
  const persistedConversation = await conversationRepository.findByChatwootConversationId(
    metadata.chatwootConversationId
  ) || await conversationRepository.upsertConversation({
    chatwootConversationId: metadata.chatwootConversationId,
    chatwootContactId: metadata.chatwootContactId,
    contactName: metadata.contactName,
    status: metadata.status as 'open' | 'pending' | 'resolved' | 'closed',
  });
  const context = await loadConversationContext(
    persistedConversation.id,
    metadata.chatwootConversationId,
    metadata.contactId,
    metadata.chatwootContactId,
    metadata.contactName,
    metadata.inboxId,
    metadata.accountId
  );

  const webhookMessage = getWebhookMessage(payload);
  await handoffRepository.create({
    conversationId: persistedConversation.id,
    triggerType: 'human_operator_message',
    triggerReason: reason,
    summary: 'Mensagem enviada por operador humano; automacao pausada.',
    pendingQuestions: [],
    riskLevel: 'low',
    idempotencyKey: `cvg:human-takeover:${persistedConversation.id}:${webhookMessage?.id || metadata.chatwootConversationId}`,
  });
  await updateConversationState(context, 'handoff', { reason });

  log.info('Automation paused for human takeover', {
    conversationId: context.conversationId,
    chatwootConversationId: context.chatwootConversationId,
    reason,
  });
}

/**
 * Handles outgoing Chatwoot events before normal inbound-message processing.
 * Returns true whenever the event was outgoing and therefore fully consumed.
 */
export async function handleOutgoingMessage(
  payload: ChatwootWebhookPayload,
  log: RuntimeLogger
): Promise<boolean> {
  const webhookMessage = getWebhookMessage(payload);
  if (!isOutgoingMessage(webhookMessage)) {
    return false;
  }

  if (webhookMessage.private) {
    log.info('Private outgoing message skipped');
    return true;
  }

  const durableBotMessage = await responseOutboxRepository.findByChatwootMessageId(webhookMessage.id);
  const isKnownBotMessage = Boolean(durableBotMessage)
    || await redisClient.isBotOutgoingMessageId(webhookMessage.id);
  const isPendingBotMessage = config.chatwoot.allowContentTakeoverFallback
    ? await redisClient.consumeBotOutgoingContent(
      payload.conversation.id,
      webhookMessage.content || ''
    )
    : false;

  // If the process crashed after Chatwoot accepted an idempotent response,
  // the outgoing webhook can carry the durable marker even though the local
  // row has no external message ID yet. Reconcile it before classifying the
  // event as a human takeover.
  const responseOutbox = responseOutboxRepository as typeof responseOutboxRepository & {
    findByIdempotencyKey?: (
      idempotencyKey: string
    ) => Promise<Awaited<ReturnType<typeof responseOutboxRepository.getById>>>;
  };
  const outgoingMarker = webhookMessage.content_attributes?.cvg_idempotency_key;
  const markedBotIntent = outgoingMarker && responseOutbox.findByIdempotencyKey
    ? await responseOutbox.findByIdempotencyKey(outgoingMarker)
    : null;
  if (markedBotIntent?.status === 'unknown') {
    try {
      await responseOutboxRepository.markReconciled(
        markedBotIntent.id,
        webhookMessage.id,
        `webhook:${webhookMessage.id}`
      );
    } catch (error) {
      log.warn('Bot response marker found but durable reconciliation is pending', {
        chatwootMessageId: webhookMessage.id,
        responseIntentId: markedBotIntent.id,
        error,
      });
    }
  }

  if (isKnownBotMessage || isPendingBotMessage || Boolean(markedBotIntent)) {
    log.info('Bot outgoing message detected, skipping human takeover', {
      chatwootMessageId: webhookMessage.id,
    });
    return true;
  }

  await pauseConversationForHumanTakeover(payload, log, 'outgoing_message');

  log.info('Human outgoing message detected, automation paused for conversation', {
    chatwootMessageId: webhookMessage.id,
    senderType: webhookMessage.sender.type,
    senderName: webhookMessage.sender.name,
  });

  return true;
}
