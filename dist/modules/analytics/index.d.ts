import { AnalyticsEvent, AnalyticsEventInput, AnalyticsEventType } from './types';
declare class AnalyticsService {
    trackEvent(input: AnalyticsEventInput): Promise<void>;
    private updateMetrics;
    private updateMetricsFromInput;
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
}
export declare const analyticsService: AnalyticsService;
export {};
//# sourceMappingURL=index.d.ts.map