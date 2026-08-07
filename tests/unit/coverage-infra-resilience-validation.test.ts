import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  CircuitBreaker,
  createRetryableErrorFilter,
  withRetry,
} from '../../src/shared/resilience';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../src/modules/validation/middleware';

function responseDouble(): Response {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response;
}

describe('infrastructure coverage: resilience', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens, rejects while open, half-opens, and closes after the configured successes', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 100,
      halfOpenRequests: 2,
    });
    const failure = new Error('dependency unavailable');

    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    expect(breaker.getStatus()).toBe('closed');
    expect(breaker.getFailures()).toBe(1);

    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    expect(breaker.getStatus()).toBe('open');
    await expect(breaker.execute(async () => 'blocked')).rejects.toThrow('Circuit breaker is open');

    now += 100;
    await expect(breaker.execute(async () => 'probe-one')).resolves.toBe('probe-one');
    expect(breaker.getStatus()).toBe('half-open');
    await expect(breaker.execute(async () => 'probe-two')).resolves.toBe('probe-two');
    expect(breaker.getStatus()).toBe('closed');
    expect(breaker.getFailures()).toBe(0);
  });

  it('reopens on a failed half-open probe and supports an explicit reset', async () => {
    let now = 5_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });

    await expect(breaker.execute(async () => { throw new Error('first'); })).rejects.toThrow('first');
    now += 50;
    await expect(breaker.execute(async () => { throw new Error('probe'); })).rejects.toThrow('probe');
    expect(breaker.getStatus()).toBe('open');
    expect(breaker.getFailures()).toBe(2);

    breaker.reset();
    expect(breaker.getStatus()).toBe('closed');
    expect(breaker.getFailures()).toBe(0);
  });

  it('retries with bounded exponential delays and eventually succeeds', async () => {
    vi.useFakeTimers();
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('temporary one'))
      .mockRejectedValueOnce(new Error('temporary two'))
      .mockResolvedValue('ok');

    const pending = withRetry(operation, {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 15,
      backoffMultiplier: 2,
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('stops when the filter rejects an error and throws the last retry error', async () => {
    const fatal = Object.assign(new Error('invalid request'), { code: 'EINVAL' });
    const operation = vi.fn().mockRejectedValue(fatal);

    await expect(withRetry(operation, {
      maxRetries: 5,
      initialDelayMs: 0,
      shouldRetry: () => false,
    })).rejects.toBe(fatal);
    expect(operation).toHaveBeenCalledTimes(1);

    const exhausted = vi.fn().mockRejectedValue(new Error('still down'));
    await expect(withRetry(exhausted, {
      maxRetries: 1,
      initialDelayMs: 0,
    })).rejects.toThrow('still down');
    expect(exhausted).toHaveBeenCalledTimes(2);
  });

  it('recognizes default, custom, message-based, and non-retryable errors', () => {
    const filter = createRetryableErrorFilter(['EAI_AGAIN']);

    expect(filter(Object.assign(new Error('socket'), { code: 'ECONNRESET' }))).toBe(true);
    expect(filter(Object.assign(new Error('dns'), { code: 'EAI_AGAIN' }))).toBe(true);
    expect(filter(new Error('Upstream network failure'))).toBe(true);
    expect(filter(new Error('Request TIMEOUT'))).toBe(true);
    expect(filter(Object.assign(new Error('bad request'), { code: 'EINVAL' }))).toBe(false);
  });
});

describe('infrastructure coverage: validation middleware', () => {
  const schema = z.object({ id: z.coerce.number().int().positive() }).strip();

  it.each([
    ['body', validateBody, 'Validation failed'],
    ['query', validateQuery, 'Invalid query parameters'],
    ['params', validateParams, 'Invalid URL parameters'],
  ] as const)('accepts parsed %s input and rejects invalid values safely', (
    property,
    factory,
    expectedError
  ) => {
    const middleware = factory(schema);
    const next = vi.fn() as NextFunction;
    const accepted = {
      path: '/resource',
      [property]: { id: '7', ignored: 'discarded' },
    } as unknown as Request;
    const acceptedResponse = responseDouble();

    middleware(accepted, acceptedResponse, next);

    expect(accepted[property]).toEqual({ id: 7 });
    expect(next).toHaveBeenCalledOnce();
    expect(acceptedResponse.status).not.toHaveBeenCalled();

    const rejected = {
      path: '/resource',
      [property]: { id: 'not-a-number' },
    } as unknown as Request;
    const rejectedResponse = responseDouble();
    const rejectedNext = vi.fn();

    middleware(rejected, rejectedResponse, rejectedNext);

    expect(rejectedNext).not.toHaveBeenCalled();
    expect(rejectedResponse.status).toHaveBeenCalledWith(400);
    expect(rejectedResponse.json).toHaveBeenCalledWith({
      success: false,
      error: expectedError,
      details: [expect.objectContaining({ field: 'id' })],
    });
  });
});
