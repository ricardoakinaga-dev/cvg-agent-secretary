import Redis from 'ioredis';
declare class RedisClient {
    private client;
    private isConnected;
    connect(): Promise<void>;
    getClient(): Redis;
    isReady(): boolean;
    disconnect(): Promise<void>;
    setMessageHash(hash: string, ttlSeconds?: number): Promise<void>;
    checkMessageHash(hash: string): Promise<boolean>;
    getConversationState(conversationId: string): Promise<Record<string, unknown> | null>;
    setConversationState(conversationId: string, state: Record<string, unknown>, ttlSeconds?: number): Promise<void>;
    appendMessageToConversation(conversationId: string, message: Record<string, unknown>, maxMessages?: number): Promise<void>;
    getConversationMessages(conversationId: string): Promise<Record<string, unknown>[]>;
    acquireLock(resourceId: string, ttlSeconds?: number): Promise<boolean>;
    releaseLock(resourceId: string): Promise<void>;
    ping(): Promise<boolean>;
}
export declare const redisClient: RedisClient;
export {};
//# sourceMappingURL=redis.d.ts.map