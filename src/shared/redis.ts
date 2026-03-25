import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config';
import { logger } from '../modules/logging';

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

  // Deduplication methods
  async setMessageHash(hash: string, ttlSeconds = 3600): Promise<void> {
    const key = `message:hash:${hash}`;
    await this.getClient().setex(key, ttlSeconds, '1');
  }

  async checkMessageHash(hash: string): Promise<boolean> {
    const key = `message:hash:${hash}`;
    const result = await this.getClient().exists(key);
    return result === 1;
  }

  // Conversation state methods
  async getConversationState(conversationId: string): Promise<Record<string, unknown> | null> {
    const key = `conversation:${conversationId}:state`;
    const data = await this.getClient().get(key);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  }

  async setConversationState(
    conversationId: string,
    state: Record<string, unknown>,
    ttlSeconds = 86400
  ): Promise<void> {
    const key = `conversation:${conversationId}:state`;
    await this.getClient().setex(key, ttlSeconds, JSON.stringify(state));
  }

  async appendMessageToConversation(
    conversationId: string,
    message: Record<string, unknown>,
    maxMessages = 50
  ): Promise<void> {
    const key = `conversation:${conversationId}:messages`;
    const client = this.getClient();

    await client.lpush(key, JSON.stringify(message));
    await client.ltrim(key, 0, maxMessages - 1);
    await client.expire(key, 86400); // 24 hours
  }

  async getConversationMessages(conversationId: string): Promise<Record<string, unknown>[]> {
    const key = `conversation:${conversationId}:messages`;
    const messages = await this.getClient().lrange(key, 0, -1);
    return messages.map((m) => JSON.parse(m));
  }

  // Lock methods
  async acquireLock(
    resourceId: string,
    ttlSeconds = 300
  ): Promise<boolean> {
    const key = `lock:${resourceId}`;
    const result = await this.getClient().set(key, Date.now().toString(), 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseLock(resourceId: string): Promise<void> {
    const key = `lock:${resourceId}`;
    await this.getClient().del(key);
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
    const key = `embedding:cache:${hash}`;
    const data = await this.getClient().get(key);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  }

  async setEmbeddingCache(text: string, embedding: number[], ttlSeconds = 604800): Promise<void> {
    const hash = this.hashText(text);
    const key = `embedding:cache:${hash}`;
    await this.getClient().setex(key, ttlSeconds, JSON.stringify(embedding));
  }

  async getEmbeddingCacheStats(): Promise<{ keys: number; hits: number; misses: number }> {
    const client = this.getClient();
    const keys = await client.keys('embedding:cache:*');
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

  private parseInfoMetric(info: string, metric: string): number | null {
    const match = info.match(new RegExp(`${metric}:(\\d+)`));
    return match ? parseInt(match[1], 10) : null;
  }
}

export const redisClient = new RedisClient();
