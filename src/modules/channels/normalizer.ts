import { randomUUID } from 'crypto';
import { NormalizedChannelMessage } from './types';
import type { ChannelType } from './types';
import { ChatwootWebhookPayload } from '../../shared/types';
import { getWebhookMessage, extractConversationMetadata } from '../chatwoot/normalizer';

export function normalizeFromChatwoot(
  payload: ChatwootWebhookPayload
): NormalizedChannelMessage | null {
  const message = getWebhookMessage(payload);
  if (!message || message.message_type !== 'incoming') {
    return null;
  }

  if (!message.content && (!message.attachments || message.attachments.length === 0)) {
    return null;
  }

  const metadata = extractConversationMetadata(payload);

  return {
    messageId: randomUUID(),
    channel: 'chatwoot',
    conversationId: metadata.conversationId,
    contactId: metadata.contactId,
    chatwootConversationId: payload.conversation.id,
    chatwootContactId: metadata.chatwootContactId,
    content: message.content || '[Mensagem sem texto]',
    messageType: 'incoming',
    senderType: 'user',
    senderName: message.sender.name || metadata.contactName,
    senderIdentifier: `chatwoot:${metadata.chatwootContactId}`,
    timestamp: new Date(),
    metadata: {
      inboxId: payload.conversation.inbox_id,
      accountId: metadata.accountId,
      private: message.private,
    },
    attachments: (message.attachments || []).map(a => ({
      id: String(a.id),
      fileUrl: a.external_url || a.file_url,
      fileName: a.filename,
      contentType: a.content_type,
    })),
  };
}

export function normalizeFromTelegram(
  update: TelegramUpdate
): NormalizedChannelMessage | null {
  if (!update.message || !update.message.text) {
    return null;
  }

  const msg = update.message;

  return {
    messageId: String(update.update_id),
    channel: 'telegram',
    conversationId: `telegram:${msg.chat.id}`,
    contactId: String(msg.from?.id || msg.chat.id),
    content: msg.text || '',
    messageType: 'incoming',
    senderType: 'user',
    senderName: msg.from?.first_name || msg.chat.first_name,
    senderIdentifier: `telegram:${msg.from?.id || msg.chat.id}`,
    timestamp: new Date(msg.date * 1000),
    metadata: {
      telegramChatId: msg.chat.id,
      telegramMessageId: msg.message_id,
      telegramUsername: msg.from?.username,
      telegramLanguageCode: msg.from?.language_code,
    },
    attachments: [],
  };
}

export function normalizeFromWhatsapp(
  payload: WhatsAppWebhookPayload
): NormalizedChannelMessage | null {
  const entry = payload.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];

  if (!message || !message.text?.body) {
    return null;
  }

  return {
    messageId: message.id || randomUUID(),
    channel: 'whatsapp',
    conversationId: `whatsapp:${change.value.metadata.phone_number_id}:${message.from}`,
    contactId: message.from,
    content: message.text.body,
    messageType: 'incoming',
    senderType: 'user',
    senderName: change.value.contacts?.[0]?.profile?.name,
    senderIdentifier: `whatsapp:${message.from}`,
    timestamp: new Date(parseInt(String(message.timestamp), 10) * 1000),
    metadata: {
      whatsappPhoneNumberId: change.value.metadata.phone_number_id,
      waMessageId: message.id,
    },
    attachments: [],
  };
}

export function detectChannelType(source: string): ChannelType {
  const lower = source.toLowerCase();
  if (lower.includes('chatwoot')) return 'chatwoot';
  if (lower.includes('telegram')) return 'telegram';
  if (lower.includes('whatsapp') || lower.includes('wa')) return 'whatsapp';
  if (lower.includes('email')) return 'email';
  return 'unknown';
}

export function isValidChannelMessage(
  msg: NormalizedChannelMessage
): boolean {
  return Boolean(
    msg.messageId &&
    msg.channel !== 'unknown' &&
    msg.content &&
    msg.contactId
  );
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    date: number;
    text?: string;
  };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
        }>;
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}
