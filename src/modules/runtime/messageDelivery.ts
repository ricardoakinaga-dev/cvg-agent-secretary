import { redisClient } from '../../shared/redis';
import { chatwootClient } from '../chatwoot/client';
import { conversationRepository } from '../conversations/repository';

/**
 * Delivers and records one bot response. The outgoing-content marker is
 * written before the external call so the corresponding Chatwoot webhook is
 * not mistaken for a human takeover.
 */
export async function sendBotMessage(
  chatwootConversationId: number,
  persistedConversationId: string,
  content: string
): Promise<void> {
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
}
