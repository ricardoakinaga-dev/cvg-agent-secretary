"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.METRICS = exports.metrics = void 0;
const logging_1 = require("../modules/logging");
class Metrics {
    counters = new Map();
    gauges = new Map();
    histograms = new Map();
    incrementCounter(name, labels) {
        const key = this.getKey(name, labels);
        const current = this.counters.get(key) || 0;
        this.counters.set(key, current + 1);
        logging_1.logger.debug('Counter incremented', { name, labels, value: current + 1 });
    }
    setGauge(name, value, labels) {
        const key = this.getKey(name, labels);
        this.gauges.set(key, value);
    }
    recordHistogram(name, value, labels) {
        const key = this.getKey(name, labels);
        const values = this.histograms.get(key) || [];
        values.push(value);
        if (values.length > 1000)
            values.shift();
        this.histograms.set(key, values);
    }
    getCounter(name, labels) {
        const key = this.getKey(name, labels);
        return this.counters.get(key) || 0;
    }
    getGauge(name, labels) {
        const key = this.getKey(name, labels);
        return this.gauges.get(key) || 0;
    }
    getHistogramValues(name, labels) {
        const key = this.getKey(name, labels);
        return this.histograms.get(key) || [];
    }
    getKey(name, labels) {
        if (!labels)
            return name;
        const labelStr = Object.entries(labels)
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        return `${name}{${labelStr}}`;
    }
    getAllMetrics() {
        return {
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
        };
    }
    reset() {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
    }
}
exports.metrics = new Metrics();
exports.METRICS = {
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
//# sourceMappingURL=metrics.js.map