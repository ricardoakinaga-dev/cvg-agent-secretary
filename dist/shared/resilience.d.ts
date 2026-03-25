export interface RetryOptions {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    shouldRetry?: (error: Error) => boolean;
}
export interface CircuitBreakerOptions {
    failureThreshold: number;
    resetTimeoutMs: number;
    halfOpenRequests: number;
}
export interface CircuitBreakerState {
    status: 'closed' | 'open' | 'half-open';
    failures: number;
    lastFailureTime: number;
    successes: number;
}
export declare class CircuitBreaker {
    private state;
    private options;
    private lastAttempt;
    constructor(options?: Partial<CircuitBreakerOptions>);
    execute<T>(fn: () => Promise<T>): Promise<T>;
    private onSuccess;
    private onFailure;
    getStatus(): string;
    getFailures(): number;
    reset(): void;
}
export declare function withRetry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
export declare function createRetryableErrorFilter(additionalRetryableErrors?: string[]): (error: Error) => boolean;
//# sourceMappingURL=resilience.d.ts.map