import { v4 as uuidv4 } from 'uuid';
import {
  ChatwootWebhookPayload,
  ChatwootMessage,
  NormalizedMessage,
} from '../../shared/types';

/**
 * Normalizes a Chatwoot webhook payload into internal format
 */
export function normalizeMessage(
  payload: ChatwootWebhookPayload
): NormalizedMessage | null {
  // Only process incoming messages from contacts
  if (!payload.message || payload.message.message_type !== 'incoming') {
    return null;
  }

  // Skip private messages (internal notes)
  if (payload.message.private) {
    return null;
  }

  const message = payload.message;

  // Validate required fields
  if (!message.content && (!message.attachments || message.attachments.length === 0)) {
    return null;
  }

  const normalized: NormalizedMessage = {
    messageId: uuidv4(),
    chatwootMessageId: message.id,
    conversationId: payload.conversation.uuid,
    chatwootConversationId: payload.conversation.id,
    contactId: payload.conversation.contact.id.toString(),
    chatwootContactId: payload.conversation.contact.id,
    content: message.content || '[Mensagem sem texto]',
    messageType: 'incoming',
    senderType: 'user',
    senderName: message.sender.name,
    timestamp: new Date(),
    attachments: normalizeAttachments(message),
  };

  return normalized;
}

function normalizeAttachments(message: ChatwootMessage): NormalizedMessage['attachments'] {
  if (!message.attachments) {
    return [];
  }

  return message.attachments.map((attachment) => ({
    id: attachment.id,
    fileUrl: attachment.external_url || attachment.file_url,
    fileName: attachment.filename,
    contentType: attachment.content_type,
  }));
}

/**
 * Validates if a webhook event should be processed
 */
export function isRelevantEvent(payload: ChatwootWebhookPayload): boolean {
  // Only process message_created events from contacts
  if (payload.event !== 'message_created') {
    return false;
  }

  if (!payload.message) {
    return false;
  }

  // Only process incoming messages
  if (payload.message.message_type !== 'incoming') {
    return false;
  }

  // Only process non-private messages
  if (payload.message.private) {
    return false;
  }

  return true;
}

/**
 * Extracts conversation metadata from webhook payload
 */
export function extractConversationMetadata(payload: ChatwootWebhookPayload): {
  conversationId: string;
  chatwootConversationId: number;
  contactId: string;
  chatwootContactId: number;
  contactName: string;
  inboxId: number;
  accountId: number;
  status: string;
} {
  return {
    conversationId: payload.conversation.uuid,
    chatwootConversationId: payload.conversation.id,
    contactId: payload.conversation.contact.id.toString(),
    chatwootContactId: payload.conversation.contact.id,
    contactName: payload.conversation.contact.name,
    inboxId: payload.conversation.inbox_id,
    accountId: payload.conversation.account_id,
    status: payload.conversation.status,
  };
}
