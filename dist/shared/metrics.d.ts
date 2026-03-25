declare class Metrics {
    private counters;
    private gauges;
    private histograms;
    incrementCounter(name: string, labels?: Record<string, string>): void;
    setGauge(name: string, value: number, labels?: Record<string, string>): void;
    recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
    getCounter(name: string, labels?: Record<string, string>): number;
    getGauge(name: string, labels?: Record<string, string>): number;
    getHistogramValues(name: string, labels?: Record<string, string>): number[];
    private getKey;
    getAllMetrics(): Record<string, unknown>;
    reset(): void;
}
export declare const metrics: Metrics;
export declare const METRICS: {
    KNOWLEDGE_SEARCH_TOTAL: string;
    KNOWLEDGE_SEARCH_ERRORS: string;
    KNOWLEDGE_SEARCH_LATENCY: string;
    KNOWLEDGE_FALLBACK_USED: string;
    KNOWLEDGE_EMBEDDING_CACHE_HIT: string;
    KNOWLEDGE_EMBEDDING_CACHE_MISS: string;
    OPENAI_REQUESTS_TOTAL: string;
    OPENAI_REQUESTS_ERRORS: string;
    OPENAI_REQUESTS_LATENCY: string;
    OPENAI_REQUESTS_FALLBACK: string;
    OPENROUTER_REQUESTS_TOTAL: string;
    OPENROUTER_REQUESTS_ERRORS: string;
    OPENROUTER_REQUESTS_LATENCY: string;
    OPENROUTER_REQUESTS_FALLBACK: string;
    AI_PROVIDER_SWITCHES: string;
    AI_PROVIDER_LATENCY: string;
    RUNTIME_MESSAGES_PROCESSED: string;
    RUNTIME_MESSAGES_ERRORS: string;
    RUNTIME_DUPLICATES_SKIPPED: string;
    RATE_LIMIT_EXCEEDED: string;
    VALIDATION_ERRORS: string;
};
export {};
//# sourceMappingURL=metrics.d.ts.map