import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Options, Store } from 'express-rate-limit';
import { Request } from 'express';
import { logger } from '../modules/logging';
import { redisClient } from '../shared/redis';
import { config } from '../config';

export class RedisRateLimitStore implements Store {
  localKeys = false;
  prefix: string;
  private windowMs = 60_000;

  constructor(namespace: string) {
    this.prefix = `cvg:${config.chatwoot.accountId}:rate-limit:${namespace}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const script = `
      local hits = redis.call('INCR', KEYS[1])
      if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
      local ttl = redis.call('PTTL', KEYS[1])
      return { hits, ttl }
    `;
    const result = await redisClient.getClient().eval(
      script,
      1,
      `${this.prefix}${key}`,
      String(this.windowMs)
    ) as [number, number];
    return {
      totalHits: Number(result[0]),
      resetTime: new Date(Date.now() + Math.max(0, Number(result[1]))),
    };
  }

  async decrement(key: string): Promise<void> {
    const script = `
      local value = tonumber(redis.call('GET', KEYS[1]) or '0')
      if value > 0 then redis.call('DECR', KEYS[1]) end
      return 1
    `;
    await redisClient.getClient().eval(script, 1, `${this.prefix}${key}`);
  }

  async resetKey(key: string): Promise<void> {
    await redisClient.getClient().del(`${this.prefix}${key}`);
  }
}

function distributedStore(namespace: string): { store: Store } | Record<string, never> {
  return config.isProduction ? { store: new RedisRateLimitStore(namespace) } : {};
}

export function getWebhookRateLimitKey(req: Request): string {
  return req.ip ? ipKeyGenerator(req.ip, 56) : 'unknown';
}

export const apiLimiter = rateLimit({
  ...distributedStore('api'),
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
  keyGenerator: (req) => {
    return req.ip ? ipKeyGenerator(req.ip, 56) : 'unknown';
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { 
      ip: req.ip, 
      path: req.path,
      correlationId: req.headers['x-correlation-id'] as string
    });
    res.status(429).json({ 
      success: false, 
      error: 'Too many requests, please try again later' 
    });
  },
});

export const webhookLimiter = rateLimit({
  ...distributedStore('webhook'),
  windowMs: 1 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Webhook rate limit exceeded' },
  keyGenerator: getWebhookRateLimitKey,
  handler: (req, res) => {
    logger.warn('Webhook rate limit exceeded', { 
      ip: req.ip, 
      path: req.path 
    });
    res.status(429).json({ 
      success: false, 
      error: 'Webhook rate limit exceeded' 
    });
  },
});

export const authLimiter = rateLimit({
  ...distributedStore('auth'),
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts' },
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip });
    res.status(429).json({ 
      success: false, 
      error: 'Too many authentication attempts, please try again later' 
    });
  },
});
