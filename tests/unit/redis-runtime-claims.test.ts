import { redisClient } from '../../src/shared/redis';

describe('Redis runtime claims', () => {
  const redis = {
    set: vi.fn(),
    eval: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(redisClient, 'getClient').mockReturnValue(redis as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the owner token in dedup claims and deletes only when ownership matches', async () => {
    redis.set.mockResolvedValueOnce('OK');
    redis.eval.mockResolvedValueOnce(1);

    await expect(redisClient.claimMessageHash('message-hash', 'owner-1', 60)).resolves.toBe(true);
    await expect(redisClient.releaseMessageHash('message-hash', 'owner-1')).resolves.toBe(true);

    expect(redis.set).toHaveBeenCalledWith(
      'cvg:1:message:hash:message-hash',
      'owner-1',
      'EX',
      60,
      'NX'
    );
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('GET', KEYS[1]) == ARGV[1]"),
      1,
      'cvg:1:message:hash:message-hash',
      'owner-1'
    );
  });

  it('uses token-safe acquisition and release for conversation locks', async () => {
    redis.set.mockResolvedValueOnce('OK');
    redis.eval.mockResolvedValueOnce(0);

    await expect(redisClient.acquireLock('runtime:conversation-1', 'owner-1', 30)).resolves.toBe(true);
    await expect(redisClient.releaseLock('runtime:conversation-1', 'owner-2')).resolves.toBe(false);

    expect(redis.set).toHaveBeenCalledWith(
      'cvg:1:lock:runtime:conversation-1',
      'owner-1',
      'EX',
      30,
      'NX'
    );
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('GET', KEYS[1]) == ARGV[1]"),
      1,
      'cvg:1:lock:runtime:conversation-1',
      'owner-2'
    );
  });

  it('renews a conversation lock only when the owner token still matches', async () => {
    redis.eval.mockResolvedValueOnce(1);

    await expect(redisClient.renewLock('runtime:conversation-1', 'owner-1', 45)).resolves.toBe(true);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('EXPIRE', KEYS[1], ARGV[2])"),
      1,
      'cvg:1:lock:runtime:conversation-1',
      'owner-1',
      '45'
    );
  });

  it('derives a stable replay identity from a durable receipt', async () => {
    redis.eval.mockResolvedValueOnce(1);

    await expect(redisClient.enqueueChatwootWebhookReplay('{"event":"message_created"}', 'receipt-1'))
      .resolves.toBe(true);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      expect.stringMatching(/^cvg:1:webhook:delivery:[0-9a-f]{64}$/),
      'cvg:1:queue:chatwoot:webhooks:pending',
      '86400',
      '{"event":"message_created"}'
    );
  });
});
