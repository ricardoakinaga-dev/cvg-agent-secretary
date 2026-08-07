import type { Request, Response } from 'express';

const rateRuntime = vi.hoisted(() => ({
  options: [] as Array<Record<string, unknown>>,
  eval: vi.fn(),
  del: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('express-rate-limit', () => ({
  default: vi.fn((options: Record<string, unknown>) => {
    rateRuntime.options.push(options);
    return options;
  }),
  ipKeyGenerator: vi.fn((ip: string, prefix?: number) => `normalized:${ip}/${prefix ?? 'default'}`),
}));

vi.mock('../../src/config', () => ({
  config: {
    isProduction: true,
    chatwoot: { accountId: '9' },
  },
}));

vi.mock('../../src/shared/redis', () => ({
  redisClient: {
    getClient: () => ({ eval: rateRuntime.eval, del: rateRuntime.del }),
  },
}));

vi.mock('../../src/modules/logging', () => ({
  logger: { warn: rateRuntime.warn },
}));

import {
  RedisRateLimitStore,
  getWebhookRateLimitKey,
} from '../../src/middleware/rate-limit';

function responseDouble(): Response {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response;
}

describe('infrastructure coverage: distributed rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses an atomic tenant-namespaced counter and clamps an expired TTL', async () => {
    rateRuntime.eval.mockResolvedValueOnce([4, -1]);
    const store = new RedisRateLimitStore('api');
    store.init({ windowMs: 1234 } as never);
    const before = Date.now();

    const expiredResult = await store.increment('client');
    expect(expiredResult.totalHits).toBe(4);
    expect(expiredResult.resetTime.getTime()).toBeGreaterThanOrEqual(before);
    expect(rateRuntime.eval).toHaveBeenCalledWith(
      expect.stringMatching(/INCR.*PEXPIRE.*PTTL/s),
      1,
      'cvg:9:rate-limit:api:client',
      '1234'
    );
    const firstResult = await (async () => {
      rateRuntime.eval.mockResolvedValueOnce([1, 100]);
      return store.increment('other');
    })();
    expect(firstResult.resetTime.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('decrements without going negative and resets the exact scoped key', async () => {
    rateRuntime.eval.mockResolvedValue(1);
    rateRuntime.del.mockResolvedValue(1);
    const store = new RedisRateLimitStore('webhook');

    await store.decrement('source');
    await store.resetKey('source');

    expect(rateRuntime.eval).toHaveBeenCalledWith(
      expect.stringMatching(/value > 0.*DECR/s),
      1,
      'cvg:9:rate-limit:webhook:source'
    );
    expect(rateRuntime.del).toHaveBeenCalledWith('cvg:9:rate-limit:webhook:source');
  });

  it('derives webhook keys only from normalized source IP and handles missing IP', () => {
    expect(getWebhookRateLimitKey({ ip: '2001:db8::1' } as Request))
      .toBe('normalized:2001:db8::1/56');
    expect(getWebhookRateLimitKey({ ip: undefined } as Request)).toBe('unknown');

    const apiOptions = rateRuntime.options[0];
    const apiKeyGenerator = apiOptions.keyGenerator as (request: Request) => string;
    expect(apiKeyGenerator({ ip: '203.0.113.1' } as Request)).toBe('normalized:203.0.113.1/56');
    expect(apiKeyGenerator({ ip: undefined } as Request)).toBe('unknown');
  });

  it.each([
    [0, 'Too many requests, please try again later'],
    [1, 'Webhook rate limit exceeded'],
    [2, 'Too many authentication attempts, please try again later'],
  ])('returns a controlled 429 response from limiter %i', (index, error) => {
    const handler = rateRuntime.options[index].handler as (request: Request, response: Response) => void;
    const request = {
      ip: '203.0.113.10',
      path: '/resource',
      headers: { 'x-correlation-id': 'correlation' },
    } as unknown as Request;
    const response = responseDouble();

    handler(request, response);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith({ success: false, error });
    expect(rateRuntime.warn).toHaveBeenCalled();
  });

  it('installs a shared Redis store for every limiter in production', () => {
    expect(rateRuntime.options).toHaveLength(3);
    expect(rateRuntime.options.every((options) => options.store instanceof RedisRateLimitStore)).toBe(true);
  });
});
