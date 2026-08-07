const mockQuery = vi.hoisted(() => vi.fn());
const mockIncrementCounter = vi.hoisted(() => vi.fn());
const mockRecordHistogram = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({ query: mockQuery }));
vi.mock('../../src/shared/metrics', () => ({
  metrics: {
    incrementCounter: mockIncrementCounter,
    recordHistogram: mockRecordHistogram,
  },
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyticsRepository } from '../../src/modules/analytics/repository';
import { analyticsService } from '../../src/modules/analytics';
import type { AnalyticsEvent, AnalyticsEventInput } from '../../src/modules/analytics/types';

function event(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    id: 'evt-1',
    eventType: 'conversation_started',
    conversationId: 'conv-1',
    metadata: {},
    timestamp: new Date('2026-01-02T03:04:05.000Z'),
    ...overrides,
  };
}

describe('analytics repository coverage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates and maps an event with tenant and nullable defaults', async () => {
    mockQuery.mockResolvedValue({ rows: [{
      id: 'evt-1', event_type: 'message_received', conversation_id: null,
      contact_id: null, provider: null, latency: null, outcome: null,
      metadata: null, timestamp: '2026-01-02T03:04:05.000Z',
    }] });

    const result = await analyticsRepository.createEvent({
      eventType: 'message_received', conversationId: '',
    });

    expect(mockQuery.mock.calls[0][1].slice(0, 8)).toEqual([
      '1', 'message_received', null, null, null, null, null, '{}',
    ]);
    expect(result).toEqual(expect.objectContaining({
      id: 'evt-1', conversationId: '', metadata: {},
      timestamp: new Date('2026-01-02T03:04:05.000Z'),
    }));
  });

  it('lists mapped events with all filters and a clamped parameterized limit', async () => {
    const since = new Date('2026-01-01T00:00:00.000Z');
    mockQuery.mockResolvedValue({ rows: [{
      id: 'evt-2', event_type: 'handoff_triggered', conversation_id: 'conv-2',
      contact_id: 'contact-2', provider: 'openai', latency: 12,
      outcome: 'handoff_to_human', metadata: { reason: 'risk' },
      timestamp: '2026-01-03T00:00:00.000Z',
    }] });

    const result = await analyticsRepository.getEvents({
      eventType: 'handoff_triggered', conversationId: 'conv-2', since, limit: 99999,
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id = $1 AND event_type = $2 AND conversation_id = $3 AND timestamp >= $4');
    expect(sql).toContain('LIMIT $5');
    expect(params).toEqual(['1', 'handoff_triggered', 'conv-2', since, 5000]);
    expect(result[0]).toEqual(expect.objectContaining({
      contactId: 'contact-2', provider: 'openai', latency: 12,
      outcome: 'handoff_to_human', metadata: { reason: 'risk' },
    }));
  });

  it('uses default filters and parses aggregate statistics with and without since', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        total_events: '9', conversations_started: '2', conversations_ended: '1',
        handoffs: '3', fallbacks: '1', errors: '2', avg_latency: '12.6',
      }] })
      .mockResolvedValueOnce({ rows: [{
        total_events: 0, conversations_started: 0, conversations_ended: 0,
        handoffs: 0, fallbacks: 0, errors: 0, avg_latency: 0,
      }] });

    await analyticsRepository.getEvents();
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 1000]);
    expect(mockQuery.mock.calls[0][0]).toContain('LIMIT $2');

    await expect(analyticsRepository.getEventStats()).resolves.toEqual({
      totalEvents: 9, conversationsStarted: 2, conversationsEnded: 1,
      handoffs: 3, fallbacks: 1, errors: 2, avgResponseLatency: 13,
    });
    expect(mockQuery.mock.calls[1][1]).toEqual(['1']);

    const since = new Date('2026-01-01T00:00:00.000Z');
    await analyticsRepository.getEventStats(since);
    expect(mockQuery.mock.calls[2][0]).toContain('timestamp >= $2');
    expect(mockQuery.mock.calls[2][1]).toEqual(['1', since]);
  });

  it('clears only the configured tenant', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await analyticsRepository.clearEvents();
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM analytics_events WHERE tenant_id = $1', ['1'],
    );
  });
});

describe('analytics service metrics coverage', () => {
  beforeEach(() => vi.clearAllMocks());

  const cases: Array<[AnalyticsEvent['eventType'], string, Partial<AnalyticsEvent>]> = [
    ['conversation_started', 'analytics_conversations_started', {}],
    ['message_received', 'analytics_messages_received', {}],
    ['response_sent', 'analytics_responses_sent', { latency: 25 }],
    ['handoff_triggered', 'analytics_handoffs', { outcome: 'escalated' }],
    ['fallback_triggered', 'analytics_fallbacks', { provider: 'openrouter' }],
    ['error_occurred', 'analytics_errors', { metadata: { errorType: 'timeout' } }],
    ['conversation_ended', 'analytics_conversations_ended', { outcome: 'auto_resolved' }],
  ];

  it.each(cases)('tracks persisted %s metrics', async (eventType, metricName, extra) => {
    vi.spyOn(analyticsRepository, 'createEvent').mockResolvedValue(event({ eventType, ...extra }));

    await analyticsService.trackEvent({ eventType, conversationId: 'conv-1' });

    expect(mockIncrementCounter).toHaveBeenCalledWith(metricName, ...(
      eventType === 'handoff_triggered' ? [{ outcome: 'escalated' }] :
      eventType === 'fallback_triggered' ? [{ provider: 'openrouter' }] :
      eventType === 'error_occurred' ? [{ type: 'timeout' }] :
      eventType === 'conversation_ended' ? [{ outcome: 'auto_resolved' }] : []
    ));
    if (eventType === 'response_sent') {
      expect(mockRecordHistogram).toHaveBeenCalledWith('analytics_response_latency', 25);
    }
  });

  it.each(cases)('falls back to input %s metrics when persistence fails', async (eventType, metricName, extra) => {
    vi.spyOn(analyticsRepository, 'createEvent').mockRejectedValue(new Error('db unavailable'));
    const input: AnalyticsEventInput = { eventType, conversationId: 'conv-1', ...extra };

    await expect(analyticsService.trackEvent(input)).resolves.toBeUndefined();

    expect(mockIncrementCounter).toHaveBeenCalledWith(metricName, ...(
      eventType === 'handoff_triggered' ? [{ outcome: 'escalated' }] :
      eventType === 'fallback_triggered' ? [{ provider: 'openrouter' }] :
      eventType === 'error_occurred' ? [{ type: 'timeout' }] :
      eventType === 'conversation_ended' ? [{ outcome: 'auto_resolved' }] : []
    ));
  });

  it('covers metric defaults and skips absent latency histograms', async () => {
    vi.spyOn(analyticsRepository, 'createEvent')
      .mockResolvedValueOnce(event({ eventType: 'response_sent' }))
      .mockResolvedValueOnce(event({ eventType: 'handoff_triggered' }))
      .mockResolvedValueOnce(event({ eventType: 'fallback_triggered' }))
      .mockResolvedValueOnce(event({ eventType: 'error_occurred' }))
      .mockResolvedValueOnce(event({ eventType: 'conversation_ended' }));

    for (const eventType of ['response_sent', 'handoff_triggered', 'fallback_triggered', 'error_occurred', 'conversation_ended'] as const) {
      await analyticsService.trackEvent({ eventType, conversationId: 'conv' });
    }

    expect(mockRecordHistogram).not.toHaveBeenCalled();
    expect(mockIncrementCounter).toHaveBeenCalledWith('analytics_handoffs', { outcome: 'unknown' });
    expect(mockIncrementCounter).toHaveBeenCalledWith('analytics_fallbacks', { provider: 'unknown' });
    expect(mockIncrementCounter).toHaveBeenCalledWith('analytics_errors', { type: 'unknown' });
    expect(mockIncrementCounter).toHaveBeenCalledWith('analytics_conversations_ended', { outcome: 'unknown' });
  });

  it('delegates reads and clears to the repository', async () => {
    const events = [event()];
    vi.spyOn(analyticsRepository, 'getEvents').mockResolvedValue(events);
    vi.spyOn(analyticsRepository, 'getEventStats').mockResolvedValue({
      totalEvents: 1, conversationsStarted: 1, conversationsEnded: 0,
      handoffs: 0, fallbacks: 0, errors: 0, avgResponseLatency: 0,
    });
    vi.spyOn(analyticsRepository, 'clearEvents').mockResolvedValue();
    const since = new Date();

    await expect(analyticsService.getEvents({ limit: 1 })).resolves.toEqual(events);
    await analyticsService.getEventStats(since);
    await analyticsService.clearEvents();

    expect(analyticsRepository.getEventStats).toHaveBeenCalledWith(since);
    expect(analyticsRepository.clearEvents).toHaveBeenCalledOnce();
  });
});
