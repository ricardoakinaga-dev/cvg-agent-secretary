import { redisClient } from '../../src/shared/redis';

describe('Redis durable webhook queue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('atomically claims a job with an owner-bound visibility lease', async () => {
    const client = {
      rpush: vi.fn().mockResolvedValue(1),
      eval: vi.fn().mockResolvedValue('serialized-job'),
    };
    vi.spyOn(redisClient, 'getClient').mockReturnValue(client as never);

    await redisClient.enqueueChatwootWebhook('serialized-job');
    await expect(
      redisClient.claimChatwootWebhook('worker-a', 30_000, 1_000)
    ).resolves.toBe('serialized-job');

    expect(client.rpush).toHaveBeenCalledWith(
      'cvg:1:queue:chatwoot:webhooks:pending',
      'serialized-job'
    );
    expect(client.eval).toHaveBeenCalledWith(
      expect.stringMatching(/HSET.*owner.*ZADD/s),
      4,
      'cvg:1:queue:chatwoot:webhooks:pending',
      'cvg:1:queue:chatwoot:webhooks:inflight',
      'cvg:1:queue:chatwoot:webhooks:leases',
      'cvg:1:queue:chatwoot:webhooks:delayed',
      'worker-a',
      '1000',
      '30000',
      '100'
    );
  });

  it('deduplicates a signed delivery atomically with queue insertion', async () => {
    const client = { eval: vi.fn().mockResolvedValue(1) };
    vi.spyOn(redisClient, 'getClient').mockReturnValue(client as never);
    const deliveryId = 'a'.repeat(64);

    await expect(redisClient.enqueueChatwootWebhookOnce(
      'serialized-job',
      deliveryId,
      600
    )).resolves.toBe(true);

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringMatching(/SET.*NX.*RPUSH/s),
      2,
      `cvg:1:webhook:delivery:${deliveryId}`,
      'cvg:1:queue:chatwoot:webhooks:pending',
      '600',
      'serialized-job'
    );
  });

  it('promotes delayed retries only when their due score is at or before claim time', async () => {
    const client = { eval: vi.fn().mockResolvedValue(null) };
    vi.spyOn(redisClient, 'getClient').mockReturnValue(client as never);

    await redisClient.claimChatwootWebhook('worker-a', 30_000, 9_999);

    const script = vi.mocked(client.eval).mock.calls[0][0] as string;
    expect(script).toMatch(
      /ZRANGEBYSCORE', KEYS\[4\], '-inf', ARGV\[2\], 'LIMIT'/
    );
    expect(script).toMatch(/ZREM', KEYS\[4\].*RPUSH', KEYS\[1\]/s);
    expect(client.eval).toHaveBeenCalledWith(
      script,
      4,
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'cvg:1:queue:chatwoot:webhooks:delayed',
      'worker-a',
      '9999',
      '30000',
      '100'
    );
  });

  it('acknowledges only when the job is still owned by the caller', async () => {
    const client = { eval: vi.fn().mockResolvedValue(1) };
    vi.spyOn(redisClient, 'getClient').mockReturnValue(client as never);

    await redisClient.acknowledgeChatwootWebhook('job-1', 'worker-a');

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringMatching(/record\.owner.*ARGV\[2\].*HDEL.*ZREM/s),
      2,
      'cvg:1:queue:chatwoot:webhooks:inflight',
      'cvg:1:queue:chatwoot:webhooks:leases',
      'job-1',
      'worker-a'
    );
  });

  it('rejects an acknowledgement from a worker that no longer owns the lease', async () => {
    const client = { eval: vi.fn().mockResolvedValue(-1) };
    vi.spyOn(redisClient, 'getClient').mockReturnValue(client as never);

    await expect(
      redisClient.acknowledgeChatwootWebhook('job-1', 'stale-worker')
    ).rejects.toThrow(/ownership/i);
  });

  it('renews an owned lease atomically', async () => {
    const client = { eval: vi.fn().mockResolvedValue(1) };
    vi.spyOn(redisClient, 'getClient').mockReturnValue(client as never);

    await redisClient.renewChatwootWebhookLease('job-1', 'worker-a', 30_000, 5_000);

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringMatching(/record\.owner.*ZADD/s),
      2,
      'cvg:1:queue:chatwoot:webhooks:inflight',
      'cvg:1:queue:chatwoot:webhooks:leases',
      'job-1',
      'worker-a',
      '35000'
    );
  });

  it('requeues into the delayed set and records the due time atomically', async () => {
    const client = { eval: vi.fn().mockResolvedValue(1) };
    vi.spyOn(redisClient, 'getClient').mockReturnValue(client as never);

    await redisClient.requeueChatwootWebhook(
      'job-1',
      'worker-a',
      'retry-job',
      2_500,
      10_000
    );

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringMatching(/record\.owner.*HDEL.*ZREM.*ZADD/s),
      3,
      'cvg:1:queue:chatwoot:webhooks:inflight',
      'cvg:1:queue:chatwoot:webhooks:leases',
      'cvg:1:queue:chatwoot:webhooks:delayed',
      'job-1',
      'worker-a',
      'retry-job',
      '12500'
    );
  });

  it('moves a poison job to a bounded, expiring dead-letter queue', async () => {
    const client = { eval: vi.fn().mockResolvedValue(1) };
    vi.spyOn(redisClient, 'getClient').mockReturnValue(client as never);

    await redisClient.failChatwootWebhook(
      'job-1',
      'worker-a',
      'failed-job',
      86_400,
      500,
      200_000_000
    );

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringMatching(/record\.owner.*ZREMRANGEBYSCORE.*ZADD.*ZCARD.*ZREMRANGEBYRANK/s),
      3,
      'cvg:1:queue:chatwoot:webhooks:inflight',
      'cvg:1:queue:chatwoot:webhooks:leases',
      'cvg:1:queue:chatwoot:webhooks:failed',
      'job-1',
      'worker-a',
      'failed-job',
      '113600000',
      '200000000',
      '500'
    );
  });

  it('recovers only jobs whose visibility leases have expired', async () => {
    const client = { eval: vi.fn().mockResolvedValue(2) };
    vi.spyOn(redisClient, 'getClient').mockReturnValue(client as never);

    await expect(redisClient.recoverExpiredChatwootWebhooks(12_000, 25)).resolves.toBe(2);

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringMatching(/ZRANGEBYSCORE.*-inf.*ARGV\[1\].*RPUSH/s),
      3,
      'cvg:1:queue:chatwoot:webhooks:pending',
      'cvg:1:queue:chatwoot:webhooks:inflight',
      'cvg:1:queue:chatwoot:webhooks:leases',
      '12000',
      '25'
    );
  });
});
