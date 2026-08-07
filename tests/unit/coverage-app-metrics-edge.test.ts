import { metrics } from '../../src/shared/metrics';

describe('metrics edge cases', () => {
  beforeEach(() => metrics.reset());

  it('returns zero and empty collections for unseen series', () => {
    expect(metrics.getCounter('missing')).toBe(0);
    expect(metrics.getGauge('missing')).toBe(0);
    expect(metrics.getHistogramValues('missing')).toEqual([]);
  });

  it('reports zero-valued aggregates for an empty histogram series', () => {
    metrics.recordHistogram('empty_summary', 1);
    const values = metrics.getHistogramValues('empty_summary');
    values.length = 0;

    expect(metrics.getAllMetrics()).toMatchObject({
      histograms: {
        empty_summary: { count: 0, sum: 0, min: 0, max: 0 },
      },
    });
    expect(metrics.toPrometheus()).toContain('empty_summary_count 0');
  });

  it('sanitizes series and label names and escapes Prometheus label values', () => {
    metrics.incrementCounter('http.requests-total', {
      'route-name': 'line 1\n"quoted"\\tail',
    });

    const output = metrics.toPrometheus();
    expect(output).toContain('# TYPE http_requests_total counter');
    expect(output).toContain(
      'http_requests_total{route_name="line 1\\n\\"quoted\\"\\\\tail"} 1'
    );
  });

  it('keeps label identity stable regardless of insertion order', () => {
    metrics.incrementCounter('requests', { z: 'last', a: 'first' });
    expect(metrics.getCounter('requests', { a: 'first', z: 'last' })).toBe(1);
  });
});
