import { describe, it, expect, beforeEach } from 'vitest';
import { metrics, METRICS } from '../../src/shared/metrics';

describe('Metrics', () => {
  beforeEach(() => {
    metrics.reset();
  });

  describe('counters', () => {
    it('should increment counter', () => {
      metrics.incrementCounter('test_counter');
      metrics.incrementCounter('test_counter');
      
      expect(metrics.getCounter('test_counter')).toBe(2);
    });

    it('should increment counter with labels', () => {
      metrics.incrementCounter('test_counter', { status: 'success' });
      metrics.incrementCounter('test_counter', { status: 'error' });
      
      expect(metrics.getCounter('test_counter', { status: 'success' })).toBe(1);
      expect(metrics.getCounter('test_counter', { status: 'error' })).toBe(1);
    });

    it('should track OpenAI errors', () => {
      metrics.incrementCounter('openai_requests_errors', { error: 'rate_limit' });
      metrics.incrementCounter('openai_requests_errors', { error: 'timeout' });
      
      expect(metrics.getCounter('openai_requests_errors', { error: 'rate_limit' })).toBe(1);
      expect(metrics.getCounter('openai_requests_errors', { error: 'timeout' })).toBe(1);
    });

    it('should track knowledge search errors', () => {
      metrics.incrementCounter('knowledge_search_errors', { error: 'search_failed' });
      
      expect(metrics.getCounter('knowledge_search_errors', { error: 'search_failed' })).toBe(1);
    });
  });

  describe('gauges', () => {
    it('should set gauge value', () => {
      metrics.setGauge('active_connections', 10);
      metrics.setGauge('active_connections', 15);
      
      expect(metrics.getGauge('active_connections')).toBe(15);
    });
  });

  describe('histograms', () => {
    it('should record histogram values', () => {
      metrics.recordHistogram('request_latency', 100);
      metrics.recordHistogram('request_latency', 200);
      metrics.recordHistogram('request_latency', 150);
      
      const values = metrics.getHistogramValues('request_latency');
      expect(values).toHaveLength(3);
      expect(values).toContain(100);
      expect(values).toContain(200);
      expect(values).toContain(150);
    });

    it('should limit histogram values to 1000', () => {
      for (let i = 0; i < 1100; i++) {
        metrics.recordHistogram('test_hist', i);
      }
      
      const values = metrics.getHistogramValues('test_hist');
      expect(values.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('getAllMetrics', () => {
    it('should return all metrics', () => {
      metrics.incrementCounter('counter1');
      metrics.setGauge('gauge1', 10);
      metrics.recordHistogram('hist1', 100);
      
      const allMetrics = metrics.getAllMetrics();
      
      expect(allMetrics.counters).toHaveProperty('counter1', 1);
      expect(allMetrics.gauges).toHaveProperty('gauge1', 10);
    });
  });

  describe('METRICS constants', () => {
    it('should have knowledge metrics', () => {
      expect(METRICS.KNOWLEDGE_SEARCH_TOTAL).toBe('knowledge_search_total');
      expect(METRICS.KNOWLEDGE_SEARCH_ERRORS).toBe('knowledge_search_errors');
      expect(METRICS.KNOWLEDGE_FALLBACK_USED).toBe('knowledge_fallback_used');
    });

    it('should have OpenAI metrics', () => {
      expect(METRICS.OPENAI_REQUESTS_TOTAL).toBe('openai_requests_total');
      expect(METRICS.OPENAI_REQUESTS_ERRORS).toBe('openai_requests_errors');
      expect(METRICS.OPENAI_REQUESTS_LATENCY).toBe('openai_requests_latency');
    });

    it('should have runtime metrics', () => {
      expect(METRICS.RUNTIME_MESSAGES_PROCESSED).toBe('runtime_messages_processed');
      expect(METRICS.RUNTIME_DUPLICATES_SKIPPED).toBe('runtime_duplicates_skipped');
    });
  });
});
