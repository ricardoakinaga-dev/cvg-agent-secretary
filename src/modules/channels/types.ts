export type ChannelType = 'chatwoot' | 'whatsapp' | 'telegram' | 'email' | 'unknown';

export interface ChannelMessage {
  id: string;
  channel: ChannelType;
  conversationId: string;
  contactId: string;
  content: string;
  messageType: 'incoming' | 'outgoing';
  senderType: 'user' | 'agent' | 'system';
  senderName?: string;
  senderIdentifier: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
  attachments?: ChannelAttachment[];
}

export interface ChannelAttachment {
  id: string;
  fileUrl?: string;
  fileName?: string;
  contentType?: string;
}

export interface ChannelResponse {
  success: boolean;
  messageId?: string;
  channel: ChannelType;
  error?: string;
}

export interface ChannelConfig {
  channel: ChannelType;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface NormalizedChannelMessage {
  messageId: string;
  channel: ChannelType;
  conversationId: string;
  contactId: string;
  chatwootConversationId?: number;
  chatwootContactId?: number;
  content: string;
  messageType: 'incoming' | 'outgoing';
  senderType: 'user' | 'agent' | 'system';
  senderName?: string;
  senderIdentifier: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
  attachments: ChannelAttachment[];
}