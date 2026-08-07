import { describe, expect, it, vi } from 'vitest';
import {
  ObservabilityCollector,
  RedisQueueTelemetrySource,
} from '../../src/modules/observability/collector';
import { METRICS, Metrics } from '../../src/shared/metrics';

describe('RedisQueueTelemetrySource', () => {
  it('returns only bounded operational queue metadata', async () => {
    const evalMock = vi.fn().mockResolvedValue([
      3,
      2,
      1,
      4,
      '2026-08-02T11:59:00.000Z',
      String(Date.parse('2026-08-02T11:59:30.000Z')),
    ]);
    const source = new RedisQueueTelemetrySource(() => ({ eval: evalMock }), '42');

    await expect(source.read(Date.parse('2026-08-02T12:00:00.000Z'))).resolves.toEqual({
      pending: 3,
      inflight: 2,
      delayed: 1,
      deadLetter: 4,
      oldestAgeSeconds: 60,
    });
    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('LLEN', KEYS[1])"),
      4,
      'cvg:42:queue:chatwoot:webhooks:pending',
      'cvg:42:queue:chatwoot:webhooks:inflight',
      'cvg:42:queue:chatwoot:webhooks:delayed',
      'cvg:42:queue:chatwoot:webhooks:failed'
    );
  });

  it('fails closed on invalid tenant or Redis response', async () => {
    expect(() => new RedisQueueTelemetrySource(() => ({ eval: vi.fn() }), '../other')).toThrow(
      'accountId must be numeric'
    );
    const invalid = new RedisQueueTelemetrySource(
      () => ({ eval: vi.fn().mockResolvedValue([1, 2]) }),
      '1'
    );
    await expect(invalid.read(Date.now())).rejects.toThrow('invalid queue telemetry snapshot');
  });
});

describe('ObservabilityCollector', () => {
  it('collects shared queue gauges and fixed dependency dimensions', async () => {
    const registry = new Metrics();
    let now = 1_000;
    const collector = new ObservabilityCollector({
      registry,
      queueSource: {
        read: vi.fn().mockResolvedValue({
          pending: 7,
          inflight: 2,
          delayed: 3,
          deadLetter: 1,
          oldestAgeSeconds: 12.5,
        }),
      },
      dependencyProbes: [
        { name: 'redis', check: vi.fn().mockResolvedValue(true) },
        { name: 'postgres', check: vi.fn().mockResolvedValue(false) },
      ],
      cacheTtlMs: 100,
      probeTimeoutMs: 50,
      now: () => now++,
    });

    await collector.collect();

    expect(registry.getGauge(METRICS.WEBHOOK_QUEUE_DEPTH, {
      scope: 'shared', state: 'pending',
    })).toBe(7);
    expect(registry.getGauge(METRICS.WEBHOOK_QUEUE_DEPTH, {
      scope: 'shared', state: 'dead_letter',
    })).toBe(1);
    expect(registry.getGauge(METRICS.WEBHOOK_QUEUE_OLDEST_AGE_SECONDS, {
      scope: 'shared',
    })).toBe(12.5);
    expect(registry.getGauge(METRICS.DEPENDENCY_UP, { dependency: 'redis' })).toBe(1);
    expect(registry.getGauge(METRICS.DEPENDENCY_UP, { dependency: 'postgres' })).toBe(0);
  });

  it('coalesces concurrent collection and honors the scrape cache', async () => {
    const registry = new Metrics();
    const read = vi.fn().mockResolvedValue({
      pending: 0, inflight: 0, delayed: 0, deadLetter: 0, oldestAgeSeconds: 0,
    });
    const collector = new ObservabilityCollector({
      registry,
      queueSource: { read },
      dependencyProbes: [],
      cacheTtlMs: 1_000,
      probeTimeoutMs: 50,
      now: () => 100,
    });

    await Promise.all([collector.collect(), collector.collect(), collector.collect()]);
    await collector.collect();

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('exports stale and error signals while preserving the last good queue values', async () => {
    const registry = new Metrics();
    const read = vi.fn()
      .mockResolvedValueOnce({
        pending: 8, inflight: 0, delayed: 0, deadLetter: 0, oldestAgeSeconds: 5,
      })
      .mockRejectedValueOnce(new Error('contains internal host and credentials'));
    let now = 0;
    const collector = new ObservabilityCollector({
      registry,
      queueSource: { read },
      dependencyProbes: [],
      cacheTtlMs: 1,
      probeTimeoutMs: 50,
      now: () => now,
    });

    await collector.collect();
    now = 2;
    await collector.collect();

    expect(registry.getGauge(METRICS.WEBHOOK_QUEUE_DEPTH, {
      scope: 'shared', state: 'pending',
    })).toBe(8);
    expect(registry.getGauge(METRICS.WEBHOOK_QUEUE_COLLECTION_UP, {
      scope: 'shared',
    })).toBe(0);
    expect(registry.getCounter(METRICS.OBSERVABILITY_COLLECTION_ERRORS_TOTAL, {
      component: 'queue',
    })).toBe(1);
  });

  it('rejects duplicate dependency dimensions', () => {
    expect(() => new ObservabilityCollector({
      queueSource: {
        read: vi.fn().mockResolvedValue({
          pending: 0, inflight: 0, delayed: 0, deadLetter: 0, oldestAgeSeconds: 0,
        }),
      },
      dependencyProbes: [
        { name: 'redis', check: vi.fn().mockResolvedValue(true) },
        { name: 'redis', check: vi.fn().mockResolvedValue(true) },
      ],
    })).toThrow('must be unique');
  });
});
