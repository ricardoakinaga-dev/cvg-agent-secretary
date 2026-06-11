import { randomUUID } from 'crypto';
import {
  ChatwootWebhookPayload,
  ChatwootMessage,
  NormalizedMessage,
  ChatwootContact,
  ChatwootMessageType,
} from '../../shared/types';

export function normalizeChatwootMessageType(
  messageType: ChatwootMessageType | undefined
): 'incoming' | 'outgoing' | null {
  if (messageType === 'incoming' || messageType === 0) {
    return 'incoming';
  }

  if (messageType === 'outgoing' || messageType === 1) {
    return 'outgoing';
  }

  return null;
}

export function isContactMessage(message: ChatwootMessage): boolean {
  return message.sender.type === 'contact';
}

export function isOutgoingMessage(message: ChatwootMessage | null): message is ChatwootMessage {
  return normalizeChatwootMessageType(message?.message_type) === 'outgoing';
}

export function getWebhookMessage(payload: ChatwootWebhookPayload): ChatwootMessage | null {
  if (payload.message) {
    return payload.message;
  }

  if (payload.event !== 'message_created' && payload.event !== 'message_updated') {
    return null;
  }

  if (payload.message_type === undefined || payload.message_type === null || typeof payload.id !== 'number') {
    return null;
  }

  return {
    id: payload.id,
    content: payload.content || '',
    message_type: payload.message_type,
    sender: payload.sender || {
      id: getContact(payload).id,
      name: getContact(payload).name,
      type: 'contact',
    },
    attachments: payload.attachments || [],
    private: payload.private || false,
  };
}

function getConversationId(payload: ChatwootWebhookPayload): string {
  return payload.conversation.uuid || `chatwoot-${payload.conversation.id}`;
}

function getContact(payload: ChatwootWebhookPayload): ChatwootContact {
  const contact = (payload.conversation.contact || payload.conversation.meta?.sender || payload.sender) as
    Partial<ChatwootContact> | undefined;

  return {
    id: contact?.id || 0,
    name: contact?.name || 'Cliente',
    email: contact?.email || '',
    phone_number: contact?.phone_number || '',
    identifier: contact?.identifier,
  };
}

/**
 * Normalizes a Chatwoot webhook payload into internal format
 */
export function normalizeMessage(
  payload: ChatwootWebhookPayload
): NormalizedMessage | null {
  const message = getWebhookMessage(payload);

  // Only process incoming public messages. Human takeover is handled separately
  // through outgoing Chatwoot messages, which is the stable signal for agents.
  if (
    !message ||
    normalizeChatwootMessageType(message.message_type) !== 'incoming'
  ) {
    return null;
  }

  // Skip private messages (internal notes)
  if (message.private) {
    return null;
  }

  // Validate required fields
  if (!message.content && (!message.attachments || message.attachments.length === 0)) {
    return null;
  }

  const contact = getContact(payload);

  const normalized: NormalizedMessage = {
    messageId: randomUUID(),
    chatwootMessageId: message.id,
    conversationId: getConversationId(payload),
    chatwootConversationId: payload.conversation.id,
    contactId: contact.id.toString(),
    chatwootContactId: contact.id,
    content: message.content || '[Mensagem sem texto]',
    messageType: 'incoming',
    senderType: 'user',
    senderName: message.sender.name || contact.name,
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
  const message = getWebhookMessage(payload);

  // Only process message_created events from contacts
  if (payload.event !== 'message_created') {
    return false;
  }

  if (!message) {
    return false;
  }

  // Only process incoming messages. Outgoing messages are handled separately
  // to pause automation when a human takes over.
  if (normalizeChatwootMessageType(message.message_type) !== 'incoming') {
    return false;
  }

  // Only process non-private messages
  if (message.private) {
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
  const contact = getContact(payload);

  return {
    conversationId: getConversationId(payload),
    chatwootConversationId: payload.conversation.id,
    contactId: contact.id.toString(),
    chatwootContactId: contact.id,
    contactName: contact.name,
    inboxId: payload.conversation.inbox_id,
    accountId: payload.conversation.account_id || payload.account?.id || 0,
    status: payload.conversation.status,
  };
}
