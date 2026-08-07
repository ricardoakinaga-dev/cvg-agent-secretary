import { config } from '../../config';
import { checkDatabaseConnection } from '../../shared/db';
import { metrics, METRICS, Metrics } from '../../shared/metrics';
import { redisClient } from '../../shared/redis';
import { logger } from '../logging';

const DEFAULT_CACHE_TTL_MS = 15_000;
const DEFAULT_PROBE_TIMEOUT_MS = 900;

const QUEUE_SNAPSHOT_SCRIPT = `
  local function get_enqueued_at(serialized)
    if not serialized then return nil end
    local ok, decoded = pcall(cjson.decode, serialized)
    if ok and decoded and decoded.enqueuedAt then return decoded.enqueuedAt end
    return nil
  end

  local function earlier(current, candidate)
    if not candidate then return current end
    if not current or candidate < current then return candidate end
    return current
  end

  local oldest = get_enqueued_at(redis.call('LINDEX', KEYS[1], 0))
  local inflight_records = redis.call('HVALS', KEYS[2])
  for _, record_json in ipairs(inflight_records) do
    local record_ok, record = pcall(cjson.decode, record_json)
    if record_ok and record and record.job then
      oldest = earlier(oldest, get_enqueued_at(record.job))
    end
  end

  local delayed = redis.call('ZRANGE', KEYS[3], 0, 0, 'WITHSCORES')
  local delayed_due_at = ''
  if delayed[2] then delayed_due_at = delayed[2] end

  return {
    redis.call('LLEN', KEYS[1]),
    redis.call('HLEN', KEYS[2]),
    redis.call('ZCARD', KEYS[3]),
    redis.call('ZCARD', KEYS[4]),
    oldest or '',
    delayed_due_at
  }
`;

export interface QueueSnapshot {
  pending: number;
  inflight: number;
  delayed: number;
  deadLetter: number;
  oldestAgeSeconds: number;
}

export interface QueueTelemetrySource {
  read(nowMs: number): Promise<QueueSnapshot>;
}

export interface DependencyProbe {
  readonly name: 'postgres' | 'redis';
  check(): Promise<boolean>;
}

interface RedisEvalClient {
  eval(script: string, numberOfKeys: number, ...args: string[]): Promise<unknown>;
}

export class RedisQueueTelemetrySource implements QueueTelemetrySource {
  private readonly keys: readonly [string, string, string, string];

  constructor(
    private readonly getClient: () => RedisEvalClient,
    accountId: string
  ) {
    if (!/^\d+$/.test(accountId)) {
      throw new Error('Queue telemetry accountId must be numeric');
    }
    const namespace = `cvg:${accountId}:queue:chatwoot:webhooks`;
    this.keys = [
      `${namespace}:pending`,
      `${namespace}:inflight`,
      `${namespace}:delayed`,
      `${namespace}:failed`,
    ];
  }

  async read(nowMs: number): Promise<QueueSnapshot> {
    const raw = await this.getClient().eval(
      QUEUE_SNAPSHOT_SCRIPT,
      this.keys.length,
      ...this.keys
    );
    if (!Array.isArray(raw) || raw.length !== 6) {
      throw new Error('Redis returned an invalid queue telemetry snapshot');
    }

    const [pending, inflight, delayed, deadLetter, oldestIso, delayedDueAt] = raw;
    const oldestTimestamp = typeof oldestIso === 'string' ? Date.parse(oldestIso) : Number.NaN;
    const delayedTimestamp = Number(delayedDueAt);
    const observedAges = [
      Number.isFinite(oldestTimestamp) ? Math.max(0, nowMs - oldestTimestamp) : 0,
      Number.isFinite(delayedTimestamp) && delayedTimestamp > 0
        ? Math.max(0, nowMs - delayedTimestamp)
        : 0,
    ];

    return {
      pending: this.parseCount(pending, 'pending'),
      inflight: this.parseCount(inflight, 'inflight'),
      delayed: this.parseCount(delayed, 'delayed'),
      deadLetter: this.parseCount(deadLetter, 'dead-letter'),
      oldestAgeSeconds: Math.max(...observedAges) / 1_000,
    };
  }

  private parseCount(value: unknown, state: string): number {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Redis returned an invalid ${state} queue count`);
    }
    return count;
  }
}

export interface ObservabilityCollectorOptions {
  registry?: Metrics;
  queueSource: QueueTelemetrySource;
  dependencyProbes: readonly DependencyProbe[];
  cacheTtlMs?: number;
  probeTimeoutMs?: number;
  now?: () => number;
}

export class ObservabilityCollector {
  private readonly registry: Metrics;
  private readonly cacheTtlMs: number;
  private readonly probeTimeoutMs: number;
  private readonly now: () => number;
  private nextCollectionAt = 0;
  private collectionInFlight: Promise<void> | null = null;

  constructor(private readonly options: ObservabilityCollectorOptions) {
    this.registry = options.registry ?? metrics;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    if (!Number.isSafeInteger(this.cacheTtlMs) || this.cacheTtlMs < 1) {
      throw new Error('cacheTtlMs must be a positive integer');
    }
    if (!Number.isSafeInteger(this.probeTimeoutMs) || this.probeTimeoutMs < 1) {
      throw new Error('probeTimeoutMs must be a positive integer');
    }
    const names = options.dependencyProbes.map(({ name }) => name);
    if (new Set(names).size !== names.length) {
      throw new Error('Dependency probe names must be unique');
    }
  }

  async collect(): Promise<void> {
    if (this.now() < this.nextCollectionAt) return;
    if (this.collectionInFlight) return this.collectionInFlight;

    this.collectionInFlight = this.runCollection().finally(() => {
      this.nextCollectionAt = this.now() + this.cacheTtlMs;
      this.collectionInFlight = null;
    });
    return this.collectionInFlight;
  }

  private async runCollection(): Promise<void> {
    const startedAt = this.now();
    await Promise.all([
      this.collectQueueSnapshot(),
      ...this.options.dependencyProbes.map((probe) => this.collectDependency(probe)),
    ]);
    this.registry.recordHistogram(
      METRICS.OBSERVABILITY_COLLECTION_LATENCY_MS,
      Math.max(0, this.now() - startedAt)
    );
  }

  private async collectQueueSnapshot(): Promise<void> {
    try {
      const snapshot = await this.withTimeout(
        this.options.queueSource.read(this.now()),
        'queue'
      );
      const shared = { scope: 'shared' };
      this.registry.setGauge(METRICS.WEBHOOK_QUEUE_DEPTH, snapshot.pending, {
        ...shared,
        state: 'pending',
      });
      this.registry.setGauge(METRICS.WEBHOOK_QUEUE_DEPTH, snapshot.inflight, {
        ...shared,
        state: 'inflight',
      });
      this.registry.setGauge(METRICS.WEBHOOK_QUEUE_DEPTH, snapshot.delayed, {
        ...shared,
        state: 'delayed',
      });
      this.registry.setGauge(METRICS.WEBHOOK_QUEUE_DEPTH, snapshot.deadLetter, {
        ...shared,
        state: 'dead_letter',
      });
      this.registry.setGauge(
        METRICS.WEBHOOK_QUEUE_OLDEST_AGE_SECONDS,
        snapshot.oldestAgeSeconds,
        shared
      );
      this.registry.setGauge(METRICS.WEBHOOK_QUEUE_COLLECTION_UP, 1, shared);
    } catch {
      this.registry.setGauge(METRICS.WEBHOOK_QUEUE_COLLECTION_UP, 0, { scope: 'shared' });
      this.registry.incrementCounter(METRICS.OBSERVABILITY_COLLECTION_ERRORS_TOTAL, {
        component: 'queue',
      });
      logger.warn('Queue telemetry collection failed');
    }
  }

  private async collectDependency(probe: DependencyProbe): Promise<void> {
    const startedAt = this.now();
    let up = false;
    try {
      up = await this.withTimeout(probe.check(), probe.name);
    } catch {
      this.registry.incrementCounter(METRICS.OBSERVABILITY_COLLECTION_ERRORS_TOTAL, {
        component: probe.name,
      });
    } finally {
      this.registry.setGauge(METRICS.DEPENDENCY_UP, up ? 1 : 0, {
        dependency: probe.name,
      });
      this.registry.recordHistogram(
        METRICS.DEPENDENCY_CHECK_LATENCY_MS,
        Math.max(0, this.now() - startedAt),
        { dependency: probe.name }
      );
    }
  }

  private async withTimeout<T>(promise: Promise<T>, component: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${component} telemetry timed out`)),
        this.probeTimeoutMs
      );
      timer.unref();
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

const queueSource = new RedisQueueTelemetrySource(
  () => redisClient.getClient(),
  config.chatwoot.accountId
);

export const observabilityCollector = new ObservabilityCollector({
  queueSource,
  dependencyProbes: [
    { name: 'redis', check: () => redisClient.ping() },
    { name: 'postgres', check: () => checkDatabaseConnection() },
  ],
});
