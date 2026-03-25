// Analytics Event Service
// Phase 4: Operational Analytics
// Phase 6: Persistent storage via database

import { logger } from '../logging';
import {
  AnalyticsEvent,
  AnalyticsEventInput,
  AnalyticsEventType,
} from './types';
import { metrics } from '../../shared/metrics';
import { analyticsRepository } from './repository';

class AnalyticsService {
  async trackEvent(input: AnalyticsEventInput): Promise<void> {
    try {
      const event = await analyticsRepository.createEvent(input);
      this.updateMetrics(event);
      logger.debug('Analytics event tracked', { eventType: event.eventType, conversationId: event.conversationId });
    } catch (error) {
      logger.error('Failed to persist analytics event', error as Error, { input });
      // Still update metrics even if persistence fails
      this.updateMetricsFromInput(input);
    }
  }

  private updateMetrics(event: AnalyticsEvent): void {
    switch (event.eventType) {
      case 'conversation_started':
        metrics.incrementCounter('analytics_conversations_started');
        break;
      case 'message_received':
        metrics.incrementCounter('analytics_messages_received');
        break;
      case 'response_sent':
        metrics.incrementCounter('analytics_responses_sent');
        if (event.latency) {
          metrics.recordHistogram('analytics_response_latency', event.latency);
        }
        break;
      case 'handoff_triggered':
        metrics.incrementCounter('analytics_handoffs', {
          outcome: event.outcome || 'unknown',
        });
        break;
      case 'fallback_triggered':
        metrics.incrementCounter('analytics_fallbacks', {
          provider: event.provider || 'unknown',
        });
        break;
      case 'error_occurred':
        metrics.incrementCounter('analytics_errors', {
          type: (event.metadata.errorType as string) || 'unknown',
        });
        break;
      case 'conversation_ended':
        metrics.incrementCounter('analytics_conversations_ended', {
          outcome: event.outcome || 'unknown',
        });
        break;
    }
  }

  private updateMetricsFromInput(input: AnalyticsEventInput): void {
    switch (input.eventType) {
      case 'conversation_started':
        metrics.incrementCounter('analytics_conversations_started');
        break;
      case 'message_received':
        metrics.incrementCounter('analytics_messages_received');
        break;
      case 'response_sent':
        metrics.incrementCounter('analytics_responses_sent');
        if (input.latency) {
          metrics.recordHistogram('analytics_response_latency', input.latency);
        }
        break;
      case 'handoff_triggered':
        metrics.incrementCounter('analytics_handoffs', {
          outcome: input.outcome || 'unknown',
        });
        break;
      case 'fallback_triggered':
        metrics.incrementCounter('analytics_fallbacks', {
          provider: input.provider || 'unknown',
        });
        break;
      case 'error_occurred':
        metrics.incrementCounter('analytics_errors', {
          type: (input.metadata?.errorType as string) || 'unknown',
        });
        break;
      case 'conversation_ended':
        metrics.incrementCounter('analytics_conversations_ended', {
          outcome: input.outcome || 'unknown',
        });
        break;
    }
  }

  async getEvents(filters?: {
    eventType?: AnalyticsEventType;
    conversationId?: string;
    since?: Date;
    limit?: number;
  }): Promise<AnalyticsEvent[]> {
    return analyticsRepository.getEvents(filters);
  }

  async getEventStats(since?: Date): Promise<{
    totalEvents: number;
    conversationsStarted: number;
    conversationsEnded: number;
    handoffs: number;
    fallbacks: number;
    errors: number;
    avgResponseLatency: number;
  }> {
    return analyticsRepository.getEventStats(since);
  }

  async clearEvents(): Promise<void> {
    await analyticsRepository.clearEvents();
    logger.info('Analytics events cleared');
  }
}

export const analyticsService = new AnalyticsService();