import { Request } from 'express';
import { getWebhookRateLimitKey, RedisRateLimitStore } from '../../src/middleware/rate-limit';
import { redisClient } from '../../src/shared/redis';

describe('webhook rate limit key', () => {
  function request(ip: string, accountHeader?: string): Request {
    return {
      ip,
      headers: accountHeader ? { 'x-chatwoot-account-id': accountHeader } : {},
    } as unknown as Request;
  }

  it('does not trust the unsigned Chatwoot account header', () => {
    expect(getWebhookRateLimitKey(request('203.0.113.7', 'attacker-selected-account')))
      .toBe(getWebhookRateLimitKey(request('203.0.113.7', 'another-account')));
  });

  it('uses distinct keys for distinct source IPs', () => {
    expect(getWebhookRateLimitKey(request('203.0.113.7')))
      .not.toBe(getWebhookRateLimitKey(request('203.0.113.8')));
  });

  it('uses one atomic Redis counter shared by all replicas', async () => {
    const client = {
      eval: vi.fn().mockResolvedValue([3, 45_000]),
      del: vi.fn().mockResolvedValue(1),
    };
    vi.spyOn(redisClient, 'getClient').mockReturnValue(client as never);
    const store = new RedisRateLimitStore('webhook');
    store.init({ windowMs: 60_000 } as never);

    const result = await store.increment('source-ip');
    await store.decrement('source-ip');
    await store.resetKey('source-ip');

    expect(result.totalHits).toBe(3);
    expect(client.eval).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/INCR.*PEXPIRE.*PTTL/s),
      1,
      'cvg:1:rate-limit:webhook:source-ip',
      '60000'
    );
    expect(client.del).toHaveBeenCalledWith('cvg:1:rate-limit:webhook:source-ip');
  });
});
