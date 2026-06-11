"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisClient = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
const logging_1 = require("../modules/logging");
class RedisClient {
    client = null;
    isConnected = false;
    async connect() {
        if (this.client && this.isConnected) {
            return;
        }
        try {
            const redisOptions = {
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    if (times > 3) {
                        logging_1.logger.error('Redis connection failed after 3 retries');
                        return null;
                    }
                    return Math.min(times * 200, 2000);
                },
            };
            if (config_1.config.redis.password) {
                redisOptions.password = config_1.config.redis.password;
            }
            this.client = new ioredis_1.default(config_1.config.redis.url, redisOptions);
            this.client.on('connect', () => {
                this.isConnected = true;
                logging_1.logger.info('Redis connected');
            });
            this.client.on('error', (error) => {
                logging_1.logger.error('Redis error', error);
            });
            this.client.on('close', () => {
                this.isConnected = false;
                logging_1.logger.warn('Redis connection closed');
            });
            // Test connection
            await this.client.ping();
        }
        catch (error) {
            logging_1.logger.error('Failed to connect to Redis', error);
            throw error;
        }
    }
    getClient() {
        if (!this.client) {
            throw new Error('Redis client not initialized. Call connect() first.');
        }
        return this.client;
    }
    isReady() {
        return this.isConnected && this.client !== null;
    }
    async disconnect() {
        if (this.client) {
            await this.client.quit();
            this.client = null;
            this.isConnected = false;
            logging_1.logger.info('Redis disconnected');
        }
    }
    // Deduplication methods
    async setMessageHash(hash, ttlSeconds = 3600) {
        const key = `message:hash:${hash}`;
        await this.getClient().setex(key, ttlSeconds, '1');
    }
    async setMessageHashIfAbsent(hash, ttlSeconds = 3600) {
        const key = `message:hash:${hash}`;
        const result = await this.getClient().set(key, '1', 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }
    async setContentHashIfAbsent(hash, ttlSeconds = 300) {
        const key = `message:content-hash:${hash}`;
        const result = await this.getClient().set(key, '1', 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }
    async checkMessageHash(hash) {
        const key = `message:hash:${hash}`;
        const result = await this.getClient().exists(key);
        return result === 1;
    }
    async markBotOutgoingContent(chatwootConversationId, content, ttlSeconds = 300) {
        const key = `bot:outgoing:content:${chatwootConversationId}:${this.hashText(content)}`;
        await this.getClient().setex(key, ttlSeconds, '1');
    }
    async consumeBotOutgoingContent(chatwootConversationId, content) {
        const key = `bot:outgoing:content:${chatwootConversationId}:${this.hashText(content)}`;
        const result = await this.getClient().del(key);
        return result > 0;
    }
    async markBotOutgoingMessageId(messageId, ttlSeconds = 3600) {
        const key = `bot:outgoing:message:${messageId}`;
        await this.getClient().setex(key, ttlSeconds, '1');
    }
    async isBotOutgoingMessageId(messageId) {
        const key = `bot:outgoing:message:${messageId}`;
        const result = await this.getClient().exists(key);
        return result === 1;
    }
    // Conversation state methods
    async getConversationState(conversationId) {
        const key = `conversation:${conversationId}:state`;
        const data = await this.getClient().get(key);
        if (data) {
            return JSON.parse(data);
        }
        return null;
    }
    async listConversationStates() {
        const client = this.getClient();
        const states = [];
        let cursor = '0';
        do {
            const [nextCursor, keys] = await client.scan(cursor, 'MATCH', 'conversation:*:state', 'COUNT', 100);
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
                const match = key.match(/^conversation:(.*):state$/);
                if (!match) {
                    return;
                }
                try {
                    states.push({
                        conversationId: match[1],
                        state: JSON.parse(data),
                    });
                }
                catch (error) {
                    logging_1.logger.warn('Failed to parse conversation state from Redis', { key, error });
                }
            });
        } while (cursor !== '0');
        return states;
    }
    async setConversationState(conversationId, state, ttlSeconds = 86400) {
        const key = `conversation:${conversationId}:state`;
        await this.getClient().setex(key, ttlSeconds, JSON.stringify(state));
    }
    async appendMessageToConversation(conversationId, message, maxMessages = 50) {
        const key = `conversation:${conversationId}:messages`;
        const client = this.getClient();
        await client.lpush(key, JSON.stringify(message));
        await client.ltrim(key, 0, maxMessages - 1);
        await client.expire(key, 86400); // 24 hours
    }
    async getConversationMessages(conversationId) {
        const key = `conversation:${conversationId}:messages`;
        const messages = await this.getClient().lrange(key, 0, -1);
        return messages.map((m) => JSON.parse(m));
    }
    // Lock methods
    async acquireLock(resourceId, ttlSeconds = 300) {
        const key = `lock:${resourceId}`;
        const result = await this.getClient().set(key, Date.now().toString(), 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }
    async releaseLock(resourceId) {
        const key = `lock:${resourceId}`;
        await this.getClient().del(key);
    }
    // Health check
    async ping() {
        try {
            const result = await this.getClient().ping();
            return result === 'PONG';
        }
        catch {
            return false;
        }
    }
    // Embedding cache methods
    async getEmbeddingCache(text) {
        const hash = this.hashText(text);
        const key = `embedding:cache:${hash}`;
        const data = await this.getClient().get(key);
        if (data) {
            return JSON.parse(data);
        }
        return null;
    }
    async setEmbeddingCache(text, embedding, ttlSeconds = 604800) {
        const hash = this.hashText(text);
        const key = `embedding:cache:${hash}`;
        await this.getClient().setex(key, ttlSeconds, JSON.stringify(embedding));
    }
    async getEmbeddingCacheStats() {
        const client = this.getClient();
        const keys = await client.keys('embedding:cache:*');
        const info = await client.info('stats');
        return {
            keys: keys.length,
            hits: this.parseInfoMetric(info, 'keyspace_hits') || 0,
            misses: this.parseInfoMetric(info, 'keyspace_misses') || 0,
        };
    }
    hashText(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    parseInfoMetric(info, metric) {
        const match = info.match(new RegExp(`${metric}:(\\d+)`));
        return match ? parseInt(match[1], 10) : null;
    }
}
exports.redisClient = new RedisClient();
//# sourceMappingURL=redis.js.map