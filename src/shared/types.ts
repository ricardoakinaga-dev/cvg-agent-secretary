// Normalized message structure (internal format)
export interface NormalizedMessage {
  messageId: string;
  chatwootMessageId: number;
  conversationId: string;
  chatwootConversationId: number;
  contactId: string;
  chatwootContactId: number;
  content: string;
  messageType: 'incoming' | 'outgoing' | 'system';
  senderType: 'user' | 'agent' | 'bot';
  senderName: string;
  timestamp: Date;
  attachments: Attachment[];
}

export interface Attachment {
  id: number;
  fileUrl?: string;
  fileName?: string;
  contentType?: string;
}

// Chatwoot webhook payload types
export interface ChatwootWebhookPayload {
  event: ChatwootEventType;
  id: number;
  conversation: ChatwootConversation;
  message?: ChatwootMessage;
}

export type ChatwootEventType =
  | 'conversation_created'
  | 'conversation_status_changed'
  | 'conversation_updated'
  | 'message_created'
  | 'message_updated';

export interface ChatwootConversation {
  id: number;
  uuid: string;
  account_id: number;
  inbox_id: number;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  assignee_id: number | null;
  contact: ChatwootContact;
}

export interface ChatwootContact {
  id: number;
  name: string;
  email: string;
  phone_number: string;
  identifier?: string;
}

export interface ChatwootMessage {
  id: number;
  content: string;
  message_type: 'incoming' | 'outgoing';
  sender: ChatwootSender;
  attachments: ChatwootAttachment[];
  private: boolean;
}

export interface ChatwootSender {
  id: number;
  name: string;
  type: 'contact' | 'agent' | 'bot';
}

export interface ChatwootAttachment {
  id: number;
  external_url?: string;
  file_url?: string;
  filename: string;
  content_type: string;
}

// Conversation context
export interface ConversationContext {
  conversationId: string;
  chatwootConversationId: number;
  contactId: string;
  chatwootContactId: number;
  contactName: string;
  messages: NormalizedMessage[];
  metadata: ConversationMetadata;
  state: ConversationState;
}

export interface ConversationMetadata {
  startedAt: Date;
  messageCount: number;
  lastMessageAt: Date;
  inboxId: number;
  accountId: number;
}

export type ConversationState = 'new' | 'in_progress' | 'waiting' | 'handoff' | 'completed' | 'failed';

// Agent runtime types
export interface AgentRequest {
  message: NormalizedMessage;
  context: ConversationContext;
}

export interface AgentResponse {
  content: string;
  action?: AgentAction;
  confidence: number;
}

export type AgentAction =
  | { type: 'respond'; content: string }
  | { type: 'handoff'; reason: string; summary: string }
  | { type: 'fallback'; reason: string };

// Memory types
export interface CustomerMemory {
  id: string;
  contactId: string;
  type: 'fact' | 'preference' | 'history';
  content: string;
  confidence: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

// Knowledge types
export interface KnowledgeChunk {
  id: string;
  content: string;
  source: string;
  relevance: number;
  category?: string;
  title?: string;
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  dependencies: DependencyStatus;
}

export interface DependencyStatus {
  redis: 'connected' | 'disconnected' | 'error';
  postgres: 'connected' | 'disconnected' | 'error';
  chatwoot: 'connected' | 'disconnected' | 'error';
  openai: 'connected' | 'disconnected' | 'error';
  knowledge: 'connected' | 'disconnected' | 'error';
}
