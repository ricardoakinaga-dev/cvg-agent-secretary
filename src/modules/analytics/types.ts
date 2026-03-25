// Analytics Event Types
// Phase 4: Operational Analytics

export type AnalyticsEventType =
  | 'conversation_started'
  | 'message_received'
  | 'response_sent'
  | 'handoff_triggered'
  | 'fallback_triggered'
  | 'error_occurred'
  | 'conversation_ended';

export type EventOutcome =
  | 'auto_resolved'
  | 'handoff_to_human'
  | 'escalated'
  | 'failed';

export interface AnalyticsEvent {
  id: string;
  eventType: AnalyticsEventType;
  conversationId: string;
  contactId?: string;
  provider?: string;
  latency?: number;
  outcome?: EventOutcome;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface AnalyticsEventInput {
  eventType: AnalyticsEventType;
  conversationId: string;
  contactId?: string;
  provider?: string;
  latency?: number;
  outcome?: EventOutcome;
  metadata?: Record<string, unknown>;
}

export const ANALYTICS_EVENT_TYPES = {
  CONVERSATION_STARTED: 'conversation_started',
  MESSAGE_RECEIVED: 'message_received',
  RESPONSE_SENT: 'response_sent',
  HANDOFF_TRIGGERED: 'handoff_triggered',
  FALLBACK_TRIGGERED: 'fallback_triggered',
  ERROR_OCCURRED: 'error_occurred',
  CONVERSATION_ENDED: 'conversation_ended',
} as const;

export const EVENT_OUTCOMES = {
  AUTO_RESOLVED: 'auto_resolved',
  HANDOFF_TO_HUMAN: 'handoff_to_human',
  ESCALATED: 'escalated',
  FAILED: 'failed',
} as const;