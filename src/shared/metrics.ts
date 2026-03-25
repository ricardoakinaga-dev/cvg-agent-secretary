import { logger } from '../modules/logging';

class Metrics {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  incrementCounter(name: string, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + 1);
    
    logger.debug('Counter incremented', { name, labels, value: current + 1 });
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    this.gauges.set(key, value);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    if (values.length > 1000) values.shift();
    this.histograms.set(key, values);
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.getKey(name, labels);
    return this.counters.get(key) || 0;
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    const key = this.getKey(name, labels);
    return this.gauges.get(key) || 0;
  }

  getHistogramValues(name: string, labels?: Record<string, string>): number[] {
    const key = this.getKey(name, labels);
    return this.histograms.get(key) || [];
  }

  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  getAllMetrics(): Record<string, unknown> {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

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
};
