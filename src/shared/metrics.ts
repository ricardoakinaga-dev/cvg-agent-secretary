import { logger } from '../modules/logging';

const DEFAULT_HISTOGRAM_BUCKETS = [
  5,
  10,
  25,
  50,
  100,
  250,
  500,
  1_000,
  2_500,
  5_000,
  10_000,
  30_000,
  60_000,
] as const;
const MAX_RETAINED_HISTOGRAM_VALUES = 1_000;
const DEFAULT_MAX_SERIES_PER_METRIC = 100;
const MAX_LABELS_PER_SERIES = 8;
const MAX_LABEL_VALUE_LENGTH = 64;
const FORBIDDEN_LABEL_NAME = /^(?:tenant|account|contact|conversation|job|correlation|phone|email|name)(?:_?id)?$/i;
const MILLISECOND_HISTOGRAM_EXPORT_NAMES: Readonly<Record<string, string>> = {
  knowledge_search_latency: 'knowledge_search_duration_seconds',
  openai_requests_latency: 'openai_request_duration_seconds',
  openrouter_requests_latency: 'openrouter_request_duration_seconds',
  ai_provider_latency: 'ai_provider_duration_seconds',
  analytics_response_latency: 'analytics_response_duration_seconds',
  webhook_queue_age_ms: 'webhook_queue_age_seconds',
  webhook_processing_latency_ms: 'webhook_processing_duration_seconds',
  dependency_check_latency_ms: 'dependency_check_duration_seconds',
  observability_collection_latency_ms: 'observability_collection_duration_seconds',
  privacy_operations_latency_ms: 'privacy_operation_duration_seconds',
};

interface HistogramState {
  count: number;
  sum: number;
  min: number;
  max: number;
  bucketCounts: number[];
  visibleLength: number;
}

export interface MetricsOptions {
  maxSeriesPerMetric?: number;
  histogramBuckets?: readonly number[];
}

/**
 * Process-local Prometheus registry.
 *
 * Counters intentionally remain local to each process. Prometheus scrapes every
 * replica and persists/aggregates the resulting time series. Shared Redis queue
 * gauges are exported with a fixed `scope="shared"` label and must be aggregated
 * with `max`, never `sum`, because every replica observes the same queue.
 */
export class Metrics {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();
  private readonly histogramStates = new Map<string, HistogramState>();
  private readonly maxSeriesPerMetric: number;
  private readonly histogramBuckets: readonly number[];
  private droppedSamples = 0;

  constructor(options: MetricsOptions = {}) {
    this.maxSeriesPerMetric = options.maxSeriesPerMetric ?? DEFAULT_MAX_SERIES_PER_METRIC;
    this.histogramBuckets = options.histogramBuckets ?? DEFAULT_HISTOGRAM_BUCKETS;

    if (!Number.isSafeInteger(this.maxSeriesPerMetric) || this.maxSeriesPerMetric < 1) {
      throw new Error('maxSeriesPerMetric must be a positive integer');
    }
    if (
      this.histogramBuckets.length === 0
      || this.histogramBuckets.some((bucket, index) => (
        !Number.isFinite(bucket)
        || bucket <= 0
        || (index > 0 && bucket <= this.histogramBuckets[index - 1])
      ))
    ) {
      throw new Error('histogramBuckets must be finite, positive, and strictly increasing');
    }
  }

  incrementCounter(name: string, labels?: Record<string, string>): void {
    this.addCounter(name, 1, labels);
  }

  addCounter(name: string, value: number, labels?: Record<string, string>): void {
    if (!Number.isFinite(value) || value < 0) {
      this.dropSample(name, 'counter value is not finite and non-negative');
      return;
    }
    const key = this.getKey(name, labels);
    if (!this.acceptSeries(this.counters, name, key)) return;
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);

    logger.debug('Counter incremented', { name, value: current + value });
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!Number.isFinite(value)) {
      this.dropSample(name, 'gauge value is not finite');
      return;
    }
    const key = this.getKey(name, labels);
    if (!this.acceptSeries(this.gauges, name, key)) return;
    this.gauges.set(key, value);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    if (!Number.isFinite(value) || value < 0) {
      this.dropSample(name, 'histogram value is not finite and non-negative');
      return;
    }

    const key = this.getKey(name, labels);
    if (!this.acceptSeries(this.histograms, name, key)) return;
    const values = this.histograms.get(key) ?? [];
    let state = this.histogramStates.get(key);
    if (!state) {
      state = this.emptyHistogramState();
      this.histogramStates.set(key, state);
    }

    values.push(value);
    if (values.length > MAX_RETAINED_HISTOGRAM_VALUES) values.shift();
    this.histograms.set(key, values);

    state.count += 1;
    state.sum += value;
    state.min = state.count === 1 ? value : Math.min(state.min, value);
    state.max = state.count === 1 ? value : Math.max(state.max, value);
    this.histogramBuckets.forEach((bucket, index) => {
      if (value <= bucket) state!.bucketCounts[index] += 1;
    });
    state.visibleLength = values.length;
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.getKey(name, labels)) ?? 0;
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    return this.gauges.get(this.getKey(name, labels)) ?? 0;
  }

  getHistogramValues(name: string, labels?: Record<string, string>): number[] {
    return this.histograms.get(this.getKey(name, labels)) ?? [];
  }

  getAllMetrics(): Record<string, unknown> {
    this.synchronizeExternallyMutatedHistograms();
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        [...this.histogramStates].map(([key, state]) => [key, {
          count: state.count,
          sum: state.sum,
          min: state.count > 0 ? state.min : 0,
          max: state.count > 0 ? state.max : 0,
        }])
      ),
      diagnostics: {
        droppedSamples: this.droppedSamples,
        maxSeriesPerMetric: this.maxSeriesPerMetric,
      },
    };
  }

  toPrometheus(): string {
    this.synchronizeExternallyMutatedHistograms();
    const lines: string[] = [];
    this.appendScalarMetrics(lines, this.counters, 'counter');
    this.appendScalarMetrics(lines, this.gauges, 'gauge');
    this.appendHistograms(lines);
    lines.push(
      '# HELP cvg_metrics_dropped_samples_total Samples rejected by local cardinality or value guards.',
      '# TYPE cvg_metrics_dropped_samples_total counter',
      `cvg_metrics_dropped_samples_total ${this.droppedSamples}`,
      '# HELP process_start_time_seconds Start time of the process since unix epoch in seconds.',
      '# TYPE process_start_time_seconds gauge',
      `process_start_time_seconds ${PROCESS_START_TIME_SECONDS}`
    );
    return `${lines.join('\n')}\n`;
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.histogramStates.clear();
    this.droppedSamples = 0;
  }

  private getKey(name: string, labels?: Record<string, string>): string {
    const safeName = name.slice(0, 128);
    if (!labels || Object.keys(labels).length === 0) return safeName;

    const entries = Object.entries(labels)
      .filter(([label]) => !FORBIDDEN_LABEL_NAME.test(label))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_LABELS_PER_SERIES)
      .map(([label, value]) => [
        label.slice(0, 64),
        value.length <= MAX_LABEL_VALUE_LENGTH ? value : '__value_too_long__',
      ] as [string, string]);

    return `${safeName}|${JSON.stringify(entries)}`;
  }

  private acceptSeries(map: Map<string, unknown>, name: string, key: string): boolean {
    if (map.has(key)) return true;
    let series = 0;
    for (const existingKey of map.keys()) {
      if (this.rawMetricName(existingKey) === name.slice(0, 128)) series += 1;
    }
    if (series < this.maxSeriesPerMetric) return true;
    this.dropSample(name, 'metric series cardinality limit reached');
    return false;
  }

  private dropSample(name: string, reason: string): void {
    this.droppedSamples += 1;
    logger.warn('Metric sample rejected', { metric: name.slice(0, 128), reason });
  }

  private appendScalarMetrics(
    lines: string[],
    registry: Map<string, number>,
    type: 'counter' | 'gauge'
  ): void {
    const declared = new Set<string>();
    for (const [key, value] of registry) {
      const series = this.parseSeriesKey(key);
      if (!declared.has(series.name)) {
        lines.push(
          `# HELP ${series.name} Application ${type} metric ${series.name}.`,
          `# TYPE ${series.name} ${type}`
        );
        declared.add(series.name);
      }
      lines.push(`${series.name}${this.formatLabels(series.entries)} ${value}`);
    }
  }

  private appendHistograms(lines: string[]): void {
    const declared = new Set<string>();
    for (const [key, state] of this.histogramStates) {
      const series = this.parseSeriesKey(key);
      const exportedName = MILLISECOND_HISTOGRAM_EXPORT_NAMES[series.name] ?? series.name;
      const scale = exportedName === series.name ? 1 : 1_000;
      if (!declared.has(exportedName)) {
        lines.push(
          `# HELP ${exportedName} Application histogram ${exportedName}.`,
          `# TYPE ${exportedName} histogram`
        );
        declared.add(exportedName);
      }
      this.histogramBuckets.forEach((bucket, index) => {
        lines.push(
          `${exportedName}_bucket${this.formatLabels([...series.entries, ['le', String(bucket / scale)]])} ${state.bucketCounts[index]}`
        );
      });
      lines.push(
        `${exportedName}_bucket${this.formatLabels([...series.entries, ['le', '+Inf']])} ${state.count}`,
        `${exportedName}_sum${this.formatLabels(series.entries)} ${state.sum / scale}`,
        `${exportedName}_count${this.formatLabels(series.entries)} ${state.count}`
      );
    }
  }

  private parseSeriesKey(key: string): { name: string; entries: Array<[string, string]> } {
    const separator = key.indexOf('|');
    const rawName = separator === -1 ? key : key.slice(0, separator);
    const name = this.sanitizePrometheusIdentifier(rawName, 'metric');
    if (separator === -1) return { name, entries: [] };

    const entries = JSON.parse(key.slice(separator + 1)) as Array<[string, string]>;
    return {
      name,
      entries: entries.map(([label, value]) => [
        this.sanitizePrometheusIdentifier(label, 'label'),
        value,
      ]),
    };
  }

  private formatLabels(entries: Array<[string, string]>): string {
    if (entries.length === 0) return '';
    const rendered = entries.map(([label, value]) => {
      const safeValue = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
      return `${label}="${safeValue}"`;
    });
    return `{${rendered.join(',')}}`;
  }

  private sanitizePrometheusIdentifier(value: string, kind: 'metric' | 'label'): string {
    const sanitized = value.replace(/[^a-zA-Z0-9_:]/g, '_');
    const validStart = kind === 'metric' ? /^[a-zA-Z_:]/ : /^[a-zA-Z_]/;
    return validStart.test(sanitized) ? sanitized : `_${sanitized}`;
  }

  private rawMetricName(key: string): string {
    const separator = key.indexOf('|');
    return separator === -1 ? key : key.slice(0, separator);
  }

  private emptyHistogramState(): HistogramState {
    return {
      count: 0,
      sum: 0,
      min: 0,
      max: 0,
      bucketCounts: this.histogramBuckets.map(() => 0),
      visibleLength: 0,
    };
  }

  private synchronizeExternallyMutatedHistograms(): void {
    for (const [key, values] of this.histograms) {
      const state = this.histogramStates.get(key);
      if (!state || state.visibleLength === values.length) continue;

      const replacement = this.emptyHistogramState();
      for (const value of values) {
        replacement.count += 1;
        replacement.sum += value;
        replacement.min = replacement.count === 1 ? value : Math.min(replacement.min, value);
        replacement.max = replacement.count === 1 ? value : Math.max(replacement.max, value);
        this.histogramBuckets.forEach((bucket, index) => {
          if (value <= bucket) replacement.bucketCounts[index] += 1;
        });
      }
      replacement.visibleLength = values.length;
      this.histogramStates.set(key, replacement);
    }
  }
}

const PROCESS_START_TIME_SECONDS = Math.floor(Date.now() / 1_000);

export const metrics = new Metrics();

export const METRICS = {
  KNOWLEDGE_SEARCH_TOTAL: 'knowledge_search_total',
  KNOWLEDGE_SEARCH_ERRORS: 'knowledge_search_errors',
  KNOWLEDGE_SEARCH_LATENCY: 'knowledge_search_latency',
  KNOWLEDGE_FALLBACK_USED: 'knowledge_fallback_used',
  KNOWLEDGE_EMBEDDING_CACHE_HIT: 'knowledge_embedding_cache_hit',
  KNOWLEDGE_EMBEDDING_CACHE_MISS: 'knowledge_embedding_cache_miss',

  OPENAI_REQUESTS_TOTAL: 'openai_requests_total',
  OPENAI_REQUESTS_ERRORS: 'openai_requests_errors',
  OPENAI_REQUESTS_LATENCY: 'openai_requests_latency',
  OPENAI_REQUESTS_FALLBACK: 'openai_requests_fallback',

  OPENROUTER_REQUESTS_TOTAL: 'openrouter_requests_total',
  OPENROUTER_REQUESTS_ERRORS: 'openrouter_requests_errors',
  OPENROUTER_REQUESTS_LATENCY: 'openrouter_requests_latency',
  OPENROUTER_REQUESTS_FALLBACK: 'openrouter_requests_fallback',

  AI_PROVIDER_SWITCHES: 'ai_provider_switches',
  AI_PROVIDER_LATENCY: 'ai_provider_latency',

  RUNTIME_MESSAGES_PROCESSED: 'runtime_messages_processed',
  RUNTIME_MESSAGES_ERRORS: 'runtime_messages_errors',
  RUNTIME_DUPLICATES_SKIPPED: 'runtime_duplicates_skipped',

  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  VALIDATION_ERRORS: 'validation_errors',

  WEBHOOK_ENQUEUED_TOTAL: 'webhook_enqueued_total',
  WEBHOOK_DUPLICATES_TOTAL: 'webhook_duplicates_total',
  WEBHOOK_RETRIES_TOTAL: 'webhook_retries_total',
  WEBHOOK_DLQ_TOTAL: 'webhook_dlq_total',
  WEBHOOK_EXPIRED_TOTAL: 'webhook_expired_total',
  WEBHOOK_QUEUE_AGE_MS: 'webhook_queue_age_ms',
  WEBHOOK_QUEUE_DEPTH: 'webhook_queue_depth',
  WEBHOOK_QUEUE_OLDEST_AGE_SECONDS: 'webhook_queue_oldest_age_seconds',
  WEBHOOK_QUEUE_COLLECTION_UP: 'webhook_queue_collection_up',
  WEBHOOK_PROCESSING_TOTAL: 'webhook_processing_total',
  WEBHOOK_PROCESSING_ERRORS_TOTAL: 'webhook_processing_errors_total',
  WEBHOOK_PROCESSING_LATENCY_MS: 'webhook_processing_latency_ms',
  WEBHOOK_RECOVERED_TOTAL: 'webhook_recovered_total',

  DEPENDENCY_UP: 'dependency_up',
  DEPENDENCY_CHECK_LATENCY_MS: 'dependency_check_latency_ms',
  OBSERVABILITY_COLLECTION_LATENCY_MS: 'observability_collection_latency_ms',
  OBSERVABILITY_COLLECTION_ERRORS_TOTAL: 'observability_collection_errors_total',

  PRIVACY_OPERATIONS_TOTAL: 'privacy_operations_total',
  PRIVACY_OPERATIONS_ERRORS: 'privacy_operations_errors_total',
  PRIVACY_OPERATIONS_LATENCY: 'privacy_operations_latency_ms',
} as const;
