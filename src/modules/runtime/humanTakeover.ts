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
  const context = await loadConversationContext(
    metadata.conversationId,
    metadata.chatwootConversationId,
    metadata.contactId,
    metadata.chatwootContactId,
    metadata.contactName,
    metadata.inboxId,
    metadata.accountId
  );

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

  const isKnownBotMessage = await redisClient.isBotOutgoingMessageId(webhookMessage.id);
  const isPendingBotMessage = await redisClient.consumeBotOutgoingContent(
    payload.conversation.id,
    webhookMessage.content || ''
  );

  if (isKnownBotMessage || isPendingBotMessage) {
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
