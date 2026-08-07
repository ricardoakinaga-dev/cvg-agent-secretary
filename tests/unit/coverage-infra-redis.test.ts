const redisRuntime = vi.hoisted(() => ({
  instances: [] as Array<{
    options: Record<string, unknown>;
    handlers: Record<string, (...args: unknown[]) => void>;
    ping: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
  }>,
  pingError: null as Error | null,
}));

vi.mock('ioredis', () => {
  class FakeRedis {
    options: Record<string, unknown>;
    handlers: Record<string, (...args: unknown[]) => void> = {};
    ping = vi.fn(async () => {
      if (redisRuntime.pingError) throw redisRuntime.pingError;
      return 'PONG';
    });
    quit = vi.fn().mockResolvedValue('OK');

    constructor(_url: string, options: Record<string, unknown>) {
      this.options = options;
      redisRuntime.instances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers[event] = handler;
      return this;
    }
  }

  return { default: FakeRedis };
});

import { redisClient } from '../../src/shared/redis';

describe('infrastructure coverage: Redis lifecycle', () => {
  afterEach(async () => {
    redisRuntime.pingError = null;
    vi.restoreAllMocks();
    await redisClient.disconnect();
  });

  it('connects once, tracks events, bounds retries, and disconnects cleanly', async () => {
    await redisClient.connect();
    const instance = redisRuntime.instances.at(-1)!;

    expect(instance.ping).toHaveBeenCalledOnce();
    expect(redisClient.isReady()).toBe(false);
    instance.handlers.connect();
    expect(redisClient.isReady()).toBe(true);

    await redisClient.connect();
    expect(instance.ping).toHaveBeenCalledOnce();

    const retryStrategy = instance.options.retryStrategy as (times: number) => number | null;
    expect(retryStrategy(1)).toBe(200);
    expect(retryStrategy(3)).toBe(600);
    expect(retryStrategy(4)).toBeNull();
    instance.handlers.error(new Error('redis error'));
    instance.handlers.close();
    expect(redisClient.isReady()).toBe(false);

    await redisClient.disconnect();
    expect(instance.quit).toHaveBeenCalledOnce();
    expect(() => redisClient.getClient()).toThrow(/not initialized/i);
  });

  it('propagates a failed initial ping and remains not ready', async () => {
    redisRuntime.pingError = new Error('redis unavailable');

    await expect(redisClient.connect()).rejects.toThrow('redis unavailable');
    expect(redisClient.isReady()).toBe(false);
  });
});

describe('infrastructure coverage: Redis data operations', () => {
  const redis = {
    setex: vi.fn(),
    set: vi.fn(),
    eval: vi.fn(),
    exists: vi.fn(),
    del: vi.fn(),
    get: vi.fn(),
    scan: vi.fn(),
    mget: vi.fn(),
    lpush: vi.fn(),
    ltrim: vi.fn(),
    expire: vi.fn(),
    lrange: vi.fn(),
    ping: vi.fn(),
    keys: vi.fn(),
    info: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(redisClient, 'getClient').mockReturnValue(redis as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('covers deduplication, bot-origin tracking, and ownership results', async () => {
    redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null)
      .mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    redis.exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    redis.del.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await redisClient.setMessageHash('message', 10);
    await expect(redisClient.setMessageHashIfAbsent('message', 11)).resolves.toBe(true);
    await expect(redisClient.setMessageHashIfAbsent('message', 11)).resolves.toBe(false);
    await expect(redisClient.setContentHashIfAbsent('content', 12)).resolves.toBe(true);
    await expect(redisClient.setContentHashIfAbsent('content', 12)).resolves.toBe(false);
    await expect(redisClient.releaseContentHash('content', 'owner')).resolves.toBe(true);
    await expect(redisClient.releaseContentHash('content', 'wrong-owner')).resolves.toBe(false);
    await expect(redisClient.checkMessageHash('message')).resolves.toBe(true);
    await expect(redisClient.checkMessageHash('missing')).resolves.toBe(false);

    await redisClient.markBotOutgoingContent(20, 'same response', 30);
    await expect(redisClient.consumeBotOutgoingContent(20, 'same response')).resolves.toBe(true);
    await expect(redisClient.consumeBotOutgoingContent(20, 'other response')).resolves.toBe(false);
    await redisClient.markBotOutgoingMessageId(99, 31);
    redis.exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(redisClient.isBotOutgoingMessageId(99)).resolves.toBe(true);
    await expect(redisClient.isBotOutgoingMessageId(100)).resolves.toBe(false);

    expect(redis.setex).toHaveBeenCalledWith('cvg:1:message:hash:message', 10, '1');
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('GET', KEYS[1])"),
      1,
      'cvg:1:message:content-hash:content',
      'owner'
    );
  });

  it('stores and reads conversation state and bounded message history', async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ step: 'schedule' })).mockResolvedValueOnce(null);
    await expect(redisClient.getConversationState('conversation')).resolves.toEqual({ step: 'schedule' });
    await expect(redisClient.getConversationState('missing')).resolves.toBeNull();
    await redisClient.setConversationState('conversation', { step: 'done' }, 90);
    await redisClient.appendMessageToConversation('conversation', { content: 'hello' }, 2);

    redis.lrange.mockResolvedValue(['{"content":"new"}', '{"content":"old"}']);
    await expect(redisClient.getConversationMessages('conversation')).resolves.toEqual([
      { content: 'new' },
      { content: 'old' },
    ]);
    expect(redis.ltrim).toHaveBeenCalledWith('cvg:1:conversation:conversation:messages', 0, 1);
    expect(redis.expire).toHaveBeenCalledWith('cvg:1:conversation:conversation:messages', 86400);
  });

  it('scans conversation states across pages and ignores missing, malformed, or foreign values', async () => {
    redis.scan
      .mockResolvedValueOnce(['7', [
        'cvg:1:conversation:first:state',
        'cvg:1:conversation:broken:state',
        'foreign:key',
        'cvg:1:conversation:missing:state',
      ]])
      .mockResolvedValueOnce(['0', []]);
    redis.mget.mockResolvedValueOnce([
      JSON.stringify({ state: 'new' }),
      '{bad json',
      JSON.stringify({ state: 'foreign' }),
      null,
    ]);

    await expect(redisClient.listConversationStates()).resolves.toEqual([
      { conversationId: 'first', state: { state: 'new' } },
    ]);
    expect(redis.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'cvg:1:conversation:*:state',
      'COUNT',
      100
    );
    expect(redis.scan).toHaveBeenNthCalledWith(2, '7', 'MATCH', expect.any(String), 'COUNT', 100);
  });

  it('covers health and embedding cache hit, miss, storage, and metric parsing', async () => {
    redis.ping.mockResolvedValueOnce('PONG').mockResolvedValueOnce('NOPE').mockRejectedValueOnce(new Error('down'));
    await expect(redisClient.ping()).resolves.toBe(true);
    await expect(redisClient.ping()).resolves.toBe(false);
    await expect(redisClient.ping()).resolves.toBe(false);

    redis.get.mockResolvedValueOnce('[0.1,0.2]').mockResolvedValueOnce(null);
    await expect(redisClient.getEmbeddingCache('exam')).resolves.toEqual([0.1, 0.2]);
    await expect(redisClient.getEmbeddingCache('missing')).resolves.toBeNull();
    await redisClient.setEmbeddingCache('exam', [0.3], 45);

    redis.keys.mockResolvedValueOnce(['one', 'two']).mockResolvedValueOnce([]);
    redis.info
      .mockResolvedValueOnce('# Stats\r\nkeyspace_hits:12\r\nkeyspace_misses:3\r\n')
      .mockResolvedValueOnce('# Stats\r\n');
    await expect(redisClient.getEmbeddingCacheStats()).resolves.toEqual({ keys: 2, hits: 12, misses: 3 });
    await expect(redisClient.getEmbeddingCacheStats()).resolves.toEqual({ keys: 0, hits: 0, misses: 0 });
  });

  it('rejects invalid queue identifiers, ownership, durations, and limits before Redis', async () => {
    await expect(redisClient.enqueueChatwootWebhookOnce('job', 'not-a-digest')).rejects.toThrow(/SHA-256/);
    await expect(redisClient.enqueueChatwootWebhookOnce('job', 'a'.repeat(64), 0)).rejects.toThrow(/ttlSeconds/);
    await expect(redisClient.claimChatwootWebhook('', 100)).rejects.toThrow(/owner token/);
    await expect(redisClient.claimChatwootWebhook('worker', 0)).rejects.toThrow(/leaseDurationMs/);
    await expect(redisClient.acknowledgeChatwootWebhook('', 'worker')).rejects.toThrow(/job id/);
    await expect(redisClient.renewChatwootWebhookLease('job', 'worker', Number.NaN)).rejects.toThrow(/leaseDurationMs/);
    await expect(redisClient.requeueChatwootWebhook('job', 'worker', 'retry', -1)).rejects.toThrow(/delayMs/);
    await expect(redisClient.failChatwootWebhook('job', 'worker', 'failed', 0)).rejects.toThrow(/ttlSeconds/);
    await expect(redisClient.failChatwootWebhook('job', 'worker', 'failed', 1, 0)).rejects.toThrow(/maxEntries/);
    await expect(redisClient.recoverExpiredChatwootWebhooks(0, 0)).rejects.toThrow(/limit/);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('rejects lost lease ownership on renewal, requeue, and dead-letter transitions', async () => {
    redis.eval.mockResolvedValue(-1);
    await expect(redisClient.renewChatwootWebhookLease('job', 'worker', 1)).rejects.toThrow(/ownership/);
    await expect(redisClient.requeueChatwootWebhook('job', 'worker', 'retry', 0)).rejects.toThrow(/ownership/);
    await expect(redisClient.failChatwootWebhook('job', 'worker', 'failed')).rejects.toThrow(/ownership/);
  });
});
