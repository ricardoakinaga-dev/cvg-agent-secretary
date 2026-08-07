import { describe, expect, it, vi } from 'vitest';
import { Metrics } from '../../src/shared/metrics';

describe('enterprise metrics registry', () => {
  it('exports cumulative Prometheus histograms with finite buckets', () => {
    const registry = new Metrics({ histogramBuckets: [10, 100] });
    registry.recordHistogram('request_latency_ms', 5, { outcome: 'success' });
    registry.recordHistogram('request_latency_ms', 50, { outcome: 'success' });
    registry.recordHistogram('request_latency_ms', 500, { outcome: 'success' });

    const output = registry.toPrometheus();
    expect(output).toContain('# TYPE request_latency_ms histogram');
    expect(output).toContain('request_latency_ms_bucket{outcome="success",le="10"} 1');
    expect(output).toContain('request_latency_ms_bucket{outcome="success",le="100"} 2');
    expect(output).toContain('request_latency_ms_bucket{outcome="success",le="+Inf"} 3');
    expect(output).toContain('request_latency_ms_sum{outcome="success"} 555');
    expect(output).toContain('request_latency_ms_count{outcome="success"} 3');
  });

  it('keeps cumulative histogram totals after the bounded diagnostic reservoir rolls over', () => {
    const registry = new Metrics({ histogramBuckets: [2_000] });
    for (let value = 0; value < 1_100; value += 1) {
      registry.recordHistogram('latency_ms', value);
    }

    expect(registry.getHistogramValues('latency_ms')).toHaveLength(1_000);
    expect(registry.getAllMetrics()).toMatchObject({
      histograms: {
        latency_ms: {
          count: 1_100,
          sum: (1_099 * 1_100) / 2,
          min: 0,
          max: 1_099,
        },
      },
    });
  });

  it('bounds series cardinality and rejects non-finite samples without failing business code', () => {
    const registry = new Metrics({ maxSeriesPerMetric: 2 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    registry.incrementCounter('requests_total', { outcome: 'one' });
    registry.incrementCounter('requests_total', { outcome: 'two' });
    registry.incrementCounter('requests_total', { outcome: 'three' });
    registry.setGauge('unsafe', Number.NaN);

    expect(registry.getCounter('requests_total', { outcome: 'three' })).toBe(0);
    expect(registry.toPrometheus()).toContain('cvg_metrics_dropped_samples_total 2');
    warn.mockRestore();
  });

  it('does not duplicate TYPE declarations for labeled variants', () => {
    const registry = new Metrics();
    registry.incrementCounter('requests_total', { outcome: 'success' });
    registry.incrementCounter('requests_total', { outcome: 'error' });

    expect(registry.toPrometheus().match(/# TYPE requests_total counter/g)).toHaveLength(1);
  });

  it('buckets oversized label values instead of retaining possible PII', () => {
    const registry = new Metrics();
    registry.incrementCounter('requests_total', { reason: 'sensitive-'.repeat(20) });

    expect(registry.toPrometheus()).toContain('reason="__value_too_long__"');
    expect(registry.toPrometheus()).not.toContain('sensitive-');
  });

  it('drops identifier-shaped labels at the registry boundary', () => {
    const registry = new Metrics();
    registry.incrementCounter('requests_total', {
      outcome: 'success',
      tenant_id: '42',
      conversationId: 'conversation-7',
      correlation_id: 'request-secret',
    });

    const output = registry.toPrometheus();
    expect(output).toContain('requests_total{outcome="success"} 1');
    expect(output).not.toMatch(/tenant|conversation|correlation|request-secret/);
  });
});
