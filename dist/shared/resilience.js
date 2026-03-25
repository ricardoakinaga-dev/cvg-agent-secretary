"use strict";
// Retry and Circuit Breaker Utilities
// Phase 4: Resilience patterns for integrations
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = void 0;
exports.withRetry = withRetry;
exports.createRetryableErrorFilter = createRetryableErrorFilter;
const DEFAULT_RETRY_OPTIONS = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
};
const DEFAULT_CIRCUIT_BREAKER_OPTIONS = {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    halfOpenRequests: 3,
};
class CircuitBreaker {
    state;
    options;
    lastAttempt = 0;
    constructor(options = {}) {
        this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
        this.state = {
            status: 'closed',
            failures: 0,
            lastFailureTime: 0,
            successes: 0,
        };
    }
    async execute(fn) {
        if (this.state.status === 'open') {
            const timeSinceFailure = Date.now() - this.state.lastFailureTime;
            if (timeSinceFailure >= this.options.resetTimeoutMs) {
                this.state.status = 'half-open';
                this.state.successes = 0;
            }
            else {
                throw new Error('Circuit breaker is open');
            }
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    onSuccess() {
        this.lastAttempt = Date.now();
        if (this.state.status === 'half-open') {
            this.state.successes++;
            if (this.state.successes >= this.options.halfOpenRequests) {
                this.state.status = 'closed';
                this.state.failures = 0;
            }
        }
        else {
            this.state.failures = 0;
        }
    }
    onFailure() {
        this.lastAttempt = Date.now();
        this.state.failures++;
        this.state.lastFailureTime = Date.now();
        if (this.state.status === 'half-open' || this.state.failures >= this.options.failureThreshold) {
            this.state.status = 'open';
        }
    }
    getStatus() {
        return this.state.status;
    }
    getFailures() {
        return this.state.failures;
    }
    reset() {
        this.state = {
            status: 'closed',
            failures: 0,
            lastFailureTime: 0,
            successes: 0,
        };
    }
}
exports.CircuitBreaker = CircuitBreaker;
async function withRetry(fn, options = {}) {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError;
    let delay = opts.initialDelayMs;
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt === opts.maxRetries) {
                break;
            }
            if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
        }
    }
    throw lastError || new Error('Retry failed');
}
function createRetryableErrorFilter(additionalRetryableErrors = []) {
    const defaultRetryable = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'ECONNREFUSED'];
    const allRetryable = [...defaultRetryable, ...additionalRetryableErrors];
    return (error) => {
        const errorCode = error.code;
        if (errorCode && allRetryable.includes(errorCode)) {
            return true;
        }
        const errorMessage = error.message.toLowerCase();
        return errorMessage.includes('timeout') || errorMessage.includes('network');
    };
}
//# sourceMappingURL=resilience.js.map