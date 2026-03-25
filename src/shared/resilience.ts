// Retry and Circuit Breaker Utilities
// Phase 4: Resilience patterns for integrations

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

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenRequests: 3,
};

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private options: CircuitBreakerOptions;
  private lastAttempt = 0;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
    this.state = {
      status: 'closed',
      failures: 0,
      lastFailureTime: 0,
      successes: 0,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.status === 'open') {
      const timeSinceFailure = Date.now() - this.state.lastFailureTime;
      if (timeSinceFailure >= this.options.resetTimeoutMs) {
        this.state.status = 'half-open';
        this.state.successes = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.lastAttempt = Date.now();
    if (this.state.status === 'half-open') {
      this.state.successes++;
      if (this.state.successes >= this.options.halfOpenRequests) {
        this.state.status = 'closed';
        this.state.failures = 0;
      }
    } else {
      this.state.failures = 0;
    }
  }

  private onFailure(): void {
    this.lastAttempt = Date.now();
    this.state.failures++;
    this.state.lastFailureTime = Date.now();

    if (this.state.status === 'half-open' || this.state.failures >= this.options.failureThreshold) {
      this.state.status = 'open';
    }
  }

  getStatus(): string {
    return this.state.status;
  }

  getFailures(): number {
    return this.state.failures;
  }

  reset(): void {
    this.state = {
      status: 'closed',
      failures: 0,
      lastFailureTime: 0,
      successes: 0,
    };
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

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

export function createRetryableErrorFilter(additionalRetryableErrors: string[] = []): (error: Error) => boolean {
  const defaultRetryable = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'ECONNREFUSED'];
  const allRetryable = [...defaultRetryable, ...additionalRetryableErrors];

  return (error: Error): boolean => {
    const errorCode = (error as { code?: string }).code;
    if (errorCode && allRetryable.includes(errorCode)) {
      return true;
    }
    const errorMessage = error.message.toLowerCase();
    return errorMessage.includes('timeout') || errorMessage.includes('network');
  };
}