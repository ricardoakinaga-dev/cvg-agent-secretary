"use strict";
// Analytics Event Service
// Phase 4: Operational Analytics
// Phase 6: Persistent storage via database
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsService = void 0;
const logging_1 = require("../logging");
const metrics_1 = require("../../shared/metrics");
const repository_1 = require("./repository");
class AnalyticsService {
    async trackEvent(input) {
        try {
            const event = await repository_1.analyticsRepository.createEvent(input);
            this.updateMetrics(event);
            logging_1.logger.debug('Analytics event tracked', { eventType: event.eventType, conversationId: event.conversationId });
        }
        catch (error) {
            logging_1.logger.error('Failed to persist analytics event', error, { input });
            // Still update metrics even if persistence fails
            this.updateMetricsFromInput(input);
        }
    }
    updateMetrics(event) {
        switch (event.eventType) {
            case 'conversation_started':
                metrics_1.metrics.incrementCounter('analytics_conversations_started');
                break;
            case 'message_received':
                metrics_1.metrics.incrementCounter('analytics_messages_received');
                break;
            case 'response_sent':
                metrics_1.metrics.incrementCounter('analytics_responses_sent');
                if (event.latency) {
                    metrics_1.metrics.recordHistogram('analytics_response_latency', event.latency);
                }
                break;
            case 'handoff_triggered':
                metrics_1.metrics.incrementCounter('analytics_handoffs', {
                    outcome: event.outcome || 'unknown',
                });
                break;
            case 'fallback_triggered':
                metrics_1.metrics.incrementCounter('analytics_fallbacks', {
                    provider: event.provider || 'unknown',
                });
                break;
            case 'error_occurred':
                metrics_1.metrics.incrementCounter('analytics_errors', {
                    type: event.metadata.errorType || 'unknown',
                });
                break;
            case 'conversation_ended':
                metrics_1.metrics.incrementCounter('analytics_conversations_ended', {
                    outcome: event.outcome || 'unknown',
                });
                break;
        }
    }
    updateMetricsFromInput(input) {
        switch (input.eventType) {
            case 'conversation_started':
                metrics_1.metrics.incrementCounter('analytics_conversations_started');
                break;
            case 'message_received':
                metrics_1.metrics.incrementCounter('analytics_messages_received');
                break;
            case 'response_sent':
                metrics_1.metrics.incrementCounter('analytics_responses_sent');
                if (input.latency) {
                    metrics_1.metrics.recordHistogram('analytics_response_latency', input.latency);
                }
                break;
            case 'handoff_triggered':
                metrics_1.metrics.incrementCounter('analytics_handoffs', {
                    outcome: input.outcome || 'unknown',
                });
                break;
            case 'fallback_triggered':
                metrics_1.metrics.incrementCounter('analytics_fallbacks', {
                    provider: input.provider || 'unknown',
                });
                break;
            case 'error_occurred':
                metrics_1.metrics.incrementCounter('analytics_errors', {
                    type: input.metadata?.errorType || 'unknown',
                });
                break;
            case 'conversation_ended':
                metrics_1.metrics.incrementCounter('analytics_conversations_ended', {
                    outcome: input.outcome || 'unknown',
                });
                break;
        }
    }
    async getEvents(filters) {
        return repository_1.analyticsRepository.getEvents(filters);
    }
    async getEventStats(since) {
        return repository_1.analyticsRepository.getEventStats(since);
    }
    async clearEvents() {
        await repository_1.analyticsRepository.clearEvents();
        logging_1.logger.info('Analytics events cleared');
    }
}
exports.analyticsService = new AnalyticsService();
//# sourceMappingURL=index.js.map