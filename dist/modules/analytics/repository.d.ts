import { AnalyticsEvent, AnalyticsEventInput, AnalyticsEventType } from './types';
declare class AnalyticsRepository {
    createEvent(input: AnalyticsEventInput): Promise<AnalyticsEvent>;
    getEvents(filters?: {
        eventType?: AnalyticsEventType;
        conversationId?: string;
        since?: Date;
        limit?: number;
    }): Promise<AnalyticsEvent[]>;
    getEventStats(since?: Date): Promise<{
        totalEvents: number;
        conversationsStarted: number;
        conversationsEnded: number;
        handoffs: number;
        fallbacks: number;
        errors: number;
        avgResponseLatency: number;
    }>;
    clearEvents(): Promise<void>;
    private mapRowToEvent;
}
export declare const analyticsRepository: AnalyticsRepository;
export {};
//# sourceMappingURL=repository.d.ts.map