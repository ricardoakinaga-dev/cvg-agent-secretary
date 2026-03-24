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
    async checkMessageHash(hash) {
        const key = `message:hash:${hash}`;
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
}
exports.redisClient = new RedisClient();
//# sourceMappingURL=redis.js.map