export type AnalyticsEventType = 'conversation_started' | 'message_received' | 'response_sent' | 'handoff_triggered' | 'fallback_triggered' | 'error_occurred' | 'conversation_ended';
export type EventOutcome = 'auto_resolved' | 'handoff_to_human' | 'escalated' | 'failed';
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
export declare const ANALYTICS_EVENT_TYPES: {
    readonly CONVERSATION_STARTED: "conversation_started";
    readonly MESSAGE_RECEIVED: "message_received";
    readonly RESPONSE_SENT: "response_sent";
    readonly HANDOFF_TRIGGERED: "handoff_triggered";
    readonly FALLBACK_TRIGGERED: "fallback_triggered";
    readonly ERROR_OCCURRED: "error_occurred";
    readonly CONVERSATION_ENDED: "conversation_ended";
};
export declare const EVENT_OUTCOMES: {
    readonly AUTO_RESOLVED: "auto_resolved";
    readonly HANDOFF_TO_HUMAN: "handoff_to_human";
    readonly ESCALATED: "escalated";
    readonly FAILED: "failed";
};
//# sourceMappingURL=types.d.ts.map