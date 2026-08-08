import { createHash } from 'crypto';
import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config';
import { logger } from '../modules/logging';

const REDIS_NAMESPACE = `cvg:${config.chatwoot.accountId}`;
const CHATWOOT_WEBHOOK_PENDING_KEY = `${REDIS_NAMESPACE}:queue:chatwoot:webhooks:pending`;
const CHATWOOT_WEBHOOK_INFLIGHT_KEY = `${REDIS_NAMESPACE}:queue:chatwoot:webhooks:inflight`;
const CHATWOOT_WEBHOOK_LEASES_KEY = `${REDIS_NAMESPACE}:queue:chatwoot:webhooks:leases`;
const CHATWOOT_WEBHOOK_DELAYED_KEY = `${REDIS_NAMESPACE}:queue:chatwoot:webhooks:delayed`;
const CHATWOOT_WEBHOOK_FAILED_KEY = `${REDIS_NAMESPACE}:queue:chatwoot:webhooks:failed`;
const CHATWOOT_WEBHOOK_DELIVERY_PREFIX = `${REDIS_NAMESPACE}:webhook:delivery`;
const CHATWOOT_WEBHOOK_RECOVERY_BATCH_SIZE = 100;
const CHATWOOT_WEBHOOK_DLQ_TTL_SECONDS = 7 * 24 * 60 * 60;
const CHATWOOT_WEBHOOK_DLQ_MAX_ENTRIES = 1_000;

class RedisClient {
  private client: Redis | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.client && this.isConnected) {
      return;
    }

    try {
      const redisOptions: RedisOptions = {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 3) {
            logger.error('Redis connection failed after 3 retries');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
      };

      if (config.redis.password) {
        redisOptions.password = config.redis.password;
      }
      if (config.redis.username) {
        redisOptions.username = config.redis.username;
      }

      this.client = new Redis(config.redis.url, redisOptions);

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis connected');
      });

      this.client.on('error', (error) => {
        logger.error('Redis error', error);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis connection closed');
      });

      // Test connection
      await this.client.ping();
    } catch (error) {
      logger.error('Failed to connect to Redis', error as Error);
      throw error;
    }
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client;
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('Redis disconnected');
    }
  }

  // Durable Chatwoot webhook queue methods
  async enqueueChatwootWebhook(serializedJob: string): Promise<void> {
    await this.getClient().rpush(CHATWOOT_WEBHOOK_PENDING_KEY, serializedJob);
  }

  async enqueueChatwootWebhookOnce(
    serializedJob: string,
    deliveryId: string,
    ttlSeconds = 24 * 60 * 60
  ): Promise<boolean> {
    if (!/^[a-f\d]{64}$/i.test(deliveryId)) {
      throw new Error('Webhook delivery id must be a SHA-256 digest');
    }
    this.assertPositiveInteger(ttlSeconds, 'ttlSeconds');

    const script = `
      if redis.call('SET', KEYS[1], 'queued', 'EX', ARGV[1], 'NX') then
        redis.call('RPUSH', KEYS[2], ARGV[2])
        redis.call('EXPIRE', KEYS[2], ARGV[1])
        return 1
      end
      return 0
    `;
    const enqueued = await this.getClient().eval(
      script,
      2,
      `${CHATWOOT_WEBHOOK_DELIVERY_PREFIX}:${deliveryId}`,
      CHATWOOT_WEBHOOK_PENDING_KEY,
      String(ttlSeconds),
      serializedJob
    );
    return Number(enqueued) === 1;
  }

  async enqueueChatwootWebhookReplay(
    serializedJob: string,
    receiptId: string,
    ttlSeconds = 24 * 60 * 60
  ): Promise<boolean> {
    const replayDeliveryId = createHash('sha256')
      .update(`replay.${receiptId}`)
      .digest('hex');
    return this.enqueueChatwootWebhookOnce(serializedJob, replayDeliveryId, ttlSeconds);
  }

  async claimChatwootWebhook(
    ownerToken: string,
    leaseDurationMs: number,
    nowMs = Date.now()
  ): Promise<string | null> {
    this.assertOwnerToken(ownerToken);
    this.assertPositiveInteger(leaseDurationMs, 'leaseDurationMs');

    const script = `
      local now = tonumber(ARGV[2])
      local batchSize = tonumber(ARGV[4])

      local expiredIds = redis.call(
        'ZRANGEBYSCORE', KEYS[3], '-inf', ARGV[2], 'LIMIT', 0, batchSize
      )
      for _, jobId in ipairs(expiredIds) do
        local recordJson = redis.call('HGET', KEYS[2], jobId)
        if recordJson then
          local record = cjson.decode(recordJson)
          redis.call('HDEL', KEYS[2], jobId)
          redis.call('RPUSH', KEYS[1], record.job)
        end
        redis.call('ZREM', KEYS[3], jobId)
      end

      local dueJobs = redis.call(
        'ZRANGEBYSCORE', KEYS[4], '-inf', ARGV[2], 'LIMIT', 0, batchSize
      )
      for _, serializedJob in ipairs(dueJobs) do
        if redis.call('ZREM', KEYS[4], serializedJob) == 1 then
          redis.call('RPUSH', KEYS[1], serializedJob)
        end
      end

      local serializedJob = redis.call('LINDEX', KEYS[1], 0)
      if not serializedJob then
        return nil
      end

      local job = cjson.decode(serializedJob)
      if not job.id then
        return redis.error_reply('Queued Chatwoot webhook is missing an id')
      end

      redis.call('LPOP', KEYS[1])
      redis.call('HSET', KEYS[2], job.id, cjson.encode({ owner = ARGV[1], job = serializedJob }))
      redis.call('ZADD', KEYS[3], now + tonumber(ARGV[3]), job.id)
      return serializedJob
    `;

    return this.getClient().eval(
      script,
      4,
      CHATWOOT_WEBHOOK_PENDING_KEY,
      CHATWOOT_WEBHOOK_INFLIGHT_KEY,
      CHATWOOT_WEBHOOK_LEASES_KEY,
      CHATWOOT_WEBHOOK_DELAYED_KEY,
      ownerToken,
      String(nowMs),
      String(leaseDurationMs),
      String(CHATWOOT_WEBHOOK_RECOVERY_BATCH_SIZE)
    ) as Promise<string | null>;
  }

  async acknowledgeChatwootWebhook(jobId: string, ownerToken: string): Promise<void> {
    await this.completeOwnedChatwootWebhook(jobId, ownerToken, 'acknowledge');
  }

  async renewChatwootWebhookLease(
    jobId: string,
    ownerToken: string,
    leaseDurationMs: number,
    nowMs = Date.now()
  ): Promise<void> {
    this.assertJobAndOwner(jobId, ownerToken);
    this.assertPositiveInteger(leaseDurationMs, 'leaseDurationMs');

    const script = `
      local recordJson = redis.call('HGET', KEYS[1], ARGV[1])
      if not recordJson then
        return 0
      end
      local record = cjson.decode(recordJson)
      if record.owner ~= ARGV[2] then
        return -1
      end
      redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
      return 1
    `;
    const renewed = await this.getClient().eval(
      script,
      2,
      CHATWOOT_WEBHOOK_INFLIGHT_KEY,
      CHATWOOT_WEBHOOK_LEASES_KEY,
      jobId,
      ownerToken,
      String(nowMs + leaseDurationMs)
    );

    this.assertOwnedTransition(renewed, 'renew the lease for');
  }

  async requeueChatwootWebhook(
    jobId: string,
    ownerToken: string,
    serializedRetry: string,
    delayMs: number,
    nowMs = Date.now()
  ): Promise<void> {
    this.assertJobAndOwner(jobId, ownerToken);
    this.assertNonNegativeInteger(delayMs, 'delayMs');

    const script = `
      local recordJson = redis.call('HGET', KEYS[1], ARGV[1])
      if not recordJson then
        return 0
      end
      local record = cjson.decode(recordJson)
      if record.owner ~= ARGV[2] then
        return -1
      end
      redis.call('HDEL', KEYS[1], ARGV[1])
      redis.call('ZREM', KEYS[2], ARGV[1])
      redis.call('ZADD', KEYS[3], ARGV[4], ARGV[3])
      return 1
    `;
    const requeued = await this.getClient().eval(
      script,
      3,
      CHATWOOT_WEBHOOK_INFLIGHT_KEY,
      CHATWOOT_WEBHOOK_LEASES_KEY,
      CHATWOOT_WEBHOOK_DELAYED_KEY,
      jobId,
      ownerToken,
      serializedRetry,
      String(nowMs + delayMs)
    );

    this.assertOwnedTransition(requeued, 'requeue');
  }

  async failChatwootWebhook(
    jobId: string,
    ownerToken: string,
    serializedFailure: string,
    ttlSeconds = CHATWOOT_WEBHOOK_DLQ_TTL_SECONDS,
    maxEntries = CHATWOOT_WEBHOOK_DLQ_MAX_ENTRIES,
    nowMs = Date.now()
  ): Promise<void> {
    this.assertJobAndOwner(jobId, ownerToken);
    this.assertPositiveInteger(ttlSeconds, 'ttlSeconds');
    this.assertPositiveInteger(maxEntries, 'maxEntries');

    const script = `
      local recordJson = redis.call('HGET', KEYS[1], ARGV[1])
      if not recordJson then
        return 0
      end
      local record = cjson.decode(recordJson)
      if record.owner ~= ARGV[2] then
        return -1
      end
      redis.call('HDEL', KEYS[1], ARGV[1])
      redis.call('ZREM', KEYS[2], ARGV[1])
      redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[4])
      redis.call('ZADD', KEYS[3], ARGV[5], ARGV[3])
      local size = redis.call('ZCARD', KEYS[3])
      local maxEntries = tonumber(ARGV[6])
      if size > maxEntries then
        redis.call('ZREMRANGEBYRANK', KEYS[3], 0, size - maxEntries - 1)
      end
      return 1
    `;
    const failed = await this.getClient().eval(
      script,
      3,
      CHATWOOT_WEBHOOK_INFLIGHT_KEY,
      CHATWOOT_WEBHOOK_LEASES_KEY,
      CHATWOOT_WEBHOOK_FAILED_KEY,
      jobId,
      ownerToken,
      serializedFailure,
      String(nowMs - ttlSeconds * 1_000),
      String(nowMs),
      String(maxEntries)
    );

    this.assertOwnedTransition(failed, 'dead-letter');
  }

  async recoverExpiredChatwootWebhooks(
    nowMs = Date.now(),
    limit = CHATWOOT_WEBHOOK_RECOVERY_BATCH_SIZE
  ): Promise<number> {
    this.assertPositiveInteger(limit, 'limit');

    const script = `
      local expiredIds = redis.call(
        'ZRANGEBYSCORE', KEYS[3], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[2])
      )
      local recovered = 0
      for _, jobId in ipairs(expiredIds) do
        local recordJson = redis.call('HGET', KEYS[2], jobId)
        if recordJson then
          local record = cjson.decode(recordJson)
          redis.call('HDEL', KEYS[2], jobId)
          redis.call('RPUSH', KEYS[1], record.job)
          recovered = recovered + 1
        end
        redis.call('ZREM', KEYS[3], jobId)
      end
      return recovered
    `;
    const recovered = await this.getClient().eval(
      script,
      3,
      CHATWOOT_WEBHOOK_PENDING_KEY,
      CHATWOOT_WEBHOOK_INFLIGHT_KEY,
      CHATWOOT_WEBHOOK_LEASES_KEY,
      String(nowMs),
      String(limit)
    );

    return Number(recovered);
  }

  private async completeOwnedChatwootWebhook(
    jobId: string,
    ownerToken: string,
    operation: string
  ): Promise<void> {
    this.assertJobAndOwner(jobId, ownerToken);
    const script = `
      local recordJson = redis.call('HGET', KEYS[1], ARGV[1])
      if not recordJson then
        return 0
      end
      local record = cjson.decode(recordJson)
      if record.owner ~= ARGV[2] then
        return -1
      end
      redis.call('HDEL', KEYS[1], ARGV[1])
      redis.call('ZREM', KEYS[2], ARGV[1])
      return 1
    `;
    const completed = await this.getClient().eval(
      script,
      2,
      CHATWOOT_WEBHOOK_INFLIGHT_KEY,
      CHATWOOT_WEBHOOK_LEASES_KEY,
      jobId,
      ownerToken
    );

    this.assertOwnedTransition(completed, operation);
  }

  private assertOwnedTransition(result: unknown, operation: string): void {
    if (Number(result) !== 1) {
      throw new Error(
        `Unable to ${operation} Chatwoot webhook because its lease ownership was lost`
      );
    }
  }

  private assertJobAndOwner(jobId: string, ownerToken: string): void {
    if (!jobId) {
      throw new Error('Chatwoot webhook job id is required');
    }
    this.assertOwnerToken(ownerToken);
  }

  private assertOwnerToken(ownerToken: string): void {
    if (!ownerToken) {
      throw new Error('Chatwoot webhook worker owner token is required');
    }
  }

  private assertPositiveInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer`);
    }
  }

  private assertNonNegativeInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer`);
    }
  }

  // Deduplication methods
  async setMessageHash(hash: string, ttlSeconds = 3600): Promise<void> {
    const key = `${REDIS_NAMESPACE}:message:hash:${hash}`;
    await this.getClient().setex(key, ttlSeconds, '1');
  }

  async setMessageHashIfAbsent(hash: string, ttlSeconds = 3600): Promise<boolean> {
    const key = `${REDIS_NAMESPACE}:message:hash:${hash}`;
    const result = await this.getClient().set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async setContentHashIfAbsent(hash: string, ttlSeconds = 300): Promise<boolean> {
    const key = `${REDIS_NAMESPACE}:message:content-hash:${hash}`;
    const result = await this.getClient().set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async claimMessageHash(
    hash: string,
    ownerToken: string,
    ttlSeconds = 3600
  ): Promise<boolean> {
    const key = `${REDIS_NAMESPACE}:message:hash:${hash}`;
    const result = await this.getClient().set(key, ownerToken, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseMessageHash(hash: string, ownerToken: string): Promise<boolean> {
    return this.releaseOwnedKey(`${REDIS_NAMESPACE}:message:hash:${hash}`, ownerToken);
  }

  async claimContentHash(
    hash: string,
    ownerToken: string,
    ttlSeconds = 300
  ): Promise<boolean> {
    const key = `${REDIS_NAMESPACE}:message:content-hash:${hash}`;
    const result = await this.getClient().set(key, ownerToken, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseContentHash(hash: string, ownerToken: string): Promise<boolean> {
    return this.releaseOwnedKey(`${REDIS_NAMESPACE}:message:content-hash:${hash}`, ownerToken);
  }

  async checkMessageHash(hash: string): Promise<boolean> {
    const key = `${REDIS_NAMESPACE}:message:hash:${hash}`;
    const result = await this.getClient().exists(key);
    return result === 1;
  }

  async markBotOutgoingContent(
    chatwootConversationId: number,
    content: string,
    ttlSeconds = 300
  ): Promise<void> {
    const key = `${REDIS_NAMESPACE}:bot:outgoing:content:${chatwootConversationId}:${this.hashText(content)}`;
    await this.getClient().setex(key, ttlSeconds, '1');
  }

  async consumeBotOutgoingContent(
    chatwootConversationId: number,
    content: string
  ): Promise<boolean> {
    const key = `${REDIS_NAMESPACE}:bot:outgoing:content:${chatwootConversationId}:${this.hashText(content)}`;
    const result = await this.getClient().del(key);
    return result > 0;
  }

  async markBotOutgoingMessageId(messageId: number, ttlSeconds = 3600): Promise<void> {
    const key = `${REDIS_NAMESPACE}:bot:outgoing:message:${messageId}`;
    await this.getClient().setex(key, ttlSeconds, '1');
  }

  async isBotOutgoingMessageId(messageId: number): Promise<boolean> {
    const key = `${REDIS_NAMESPACE}:bot:outgoing:message:${messageId}`;
    const result = await this.getClient().exists(key);
    return result === 1;
  }

  // Conversation state methods
  async getConversationState(conversationId: string): Promise<Record<string, unknown> | null> {
    const key = `${REDIS_NAMESPACE}:conversation:${conversationId}:state`;
    const data = await this.getClient().get(key);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  }

  async listConversationStates(): Promise<Array<{ conversationId: string; state: Record<string, unknown> }>> {
    const client = this.getClient();
    const states: Array<{ conversationId: string; state: Record<string, unknown> }> = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        `${REDIS_NAMESPACE}:conversation:*:state`,
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length === 0) {
        continue;
      }

      const values = await client.mget(...keys);
      keys.forEach((key, index) => {
        const data = values[index];
        if (!data) {
          return;
        }

        const match = key.match(new RegExp(`^${REDIS_NAMESPACE}:conversation:(.*):state$`));
        if (!match) {
          return;
        }

        try {
          states.push({
            conversationId: match[1],
            state: JSON.parse(data) as Record<string, unknown>,
          });
        } catch (error) {
          logger.warn('Failed to parse conversation state from Redis', { key, error });
        }
      });
    } while (cursor !== '0');

    return states;
  }

  async setConversationState(
    conversationId: string,
    state: Record<string, unknown>,
    ttlSeconds = 86400
  ): Promise<void> {
    const key = `${REDIS_NAMESPACE}:conversation:${conversationId}:state`;
    await this.getClient().setex(key, ttlSeconds, JSON.stringify(state));
  }

  async appendMessageToConversation(
    conversationId: string,
    message: Record<string, unknown>,
    maxMessages = 50
  ): Promise<void> {
    const key = `${REDIS_NAMESPACE}:conversation:${conversationId}:messages`;
    const client = this.getClient();

    await client.lpush(key, JSON.stringify(message));
    await client.ltrim(key, 0, maxMessages - 1);
    await client.expire(key, 86400); // 24 hours
  }

  async getConversationMessages(conversationId: string): Promise<Record<string, unknown>[]> {
    const key = `${REDIS_NAMESPACE}:conversation:${conversationId}:messages`;
    const messages = await this.getClient().lrange(key, 0, -1);
    return messages.map((m) => JSON.parse(m));
  }

  // Lock methods
  async acquireLock(
    resourceId: string,
    ownerToken: string,
    ttlSeconds = 300
  ): Promise<boolean> {
    const key = `${REDIS_NAMESPACE}:lock:${resourceId}`;
    const result = await this.getClient().set(key, ownerToken, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async acquireLockWithWait(
    resourceId: string,
    ownerToken: string,
    ttlSeconds = 300,
    maxWaitMs = 10_000,
    pollMs = 200
  ): Promise<boolean> {
    if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs < 0) {
      throw new Error('maxWaitMs must be a non-negative integer');
    }
    if (!Number.isSafeInteger(pollMs) || pollMs < 1) {
      throw new Error('pollMs must be a positive integer');
    }
    const deadline = Date.now() + maxWaitMs;
    do {
      if (await this.acquireLock(resourceId, ownerToken, ttlSeconds)) return true;
      if (Date.now() >= deadline) return false;
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(pollMs, deadline - Date.now())));
    } while (Date.now() <= deadline);
    return false;
  }

  async renewLock(resourceId: string, ownerToken: string, ttlSeconds = 300): Promise<boolean> {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new Error('ttlSeconds must be a positive integer');
    }
    const key = `${REDIS_NAMESPACE}:lock:${resourceId}`;
    const result = await this.getClient().eval(`
      if redis.call('GET', KEYS[1]) ~= ARGV[1] then
        return 0
      end
      return redis.call('EXPIRE', KEYS[1], ARGV[2])
    `, 1, key, ownerToken, String(ttlSeconds));
    return Number(result) === 1;
  }

  async releaseLock(resourceId: string, ownerToken: string): Promise<boolean> {
    return this.releaseOwnedKey(`${REDIS_NAMESPACE}:lock:${resourceId}`, ownerToken);
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.getClient().ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  // Embedding cache methods
  async getEmbeddingCache(text: string): Promise<number[] | null> {
    const hash = this.hashText(text);
    const key = `${REDIS_NAMESPACE}:embedding:cache:${hash}`;
    const data = await this.getClient().get(key);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  }

  async setEmbeddingCache(text: string, embedding: number[], ttlSeconds = 604800): Promise<void> {
    const hash = this.hashText(text);
    const key = `${REDIS_NAMESPACE}:embedding:cache:${hash}`;
    await this.getClient().setex(key, ttlSeconds, JSON.stringify(embedding));
  }

  async getEmbeddingCacheStats(): Promise<{ keys: number; hits: number; misses: number }> {
    const client = this.getClient();
    const keys = await client.keys(`${REDIS_NAMESPACE}:embedding:cache:*`);
    const info = await client.info('stats');
    return {
      keys: keys.length,
      hits: this.parseInfoMetric(info, 'keyspace_hits') || 0,
      misses: this.parseInfoMetric(info, 'keyspace_misses') || 0,
    };
  }

  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async releaseOwnedKey(key: string, ownerToken: string): Promise<boolean> {
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `;
    const released = await this.getClient().eval(script, 1, key, ownerToken);
    return released === 1;
  }

  private parseInfoMetric(info: string, metric: string): number | null {
    const match = info.match(new RegExp(`${metric}:(\\d+)`));
    return match ? parseInt(match[1], 10) : null;
  }
}

export const redisClient = new RedisClient();
