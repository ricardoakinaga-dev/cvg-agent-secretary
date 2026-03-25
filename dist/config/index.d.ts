export interface DatabaseConfig {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    maxConnections: number;
}
export interface AppConfig {
    nodeEnv: string;
    isProduction: boolean;
    port: number;
    database: DatabaseConfig;
    redis: {
        url: string;
        password?: string;
    };
    openai: {
        apiKey: string;
        model: string;
        maxTokens: number;
        temperature: number;
    };
    openrouter?: {
        apiKey?: string;
        model?: string;
    };
    aiProvider: 'openai' | 'openrouter' | 'auto';
    chatwoot: {
        apiUrl: string;
        apiToken: string;
        accountId: string;
        webhookSecret?: string;
    };
    logging: {
        level: string;
    };
}
export declare const config: AppConfig;
export declare function validateConfig(): {
    valid: boolean;
    errors: string[];
};
export declare function getSafeConfig(): Record<string, unknown>;
//# sourceMappingURL=index.d.ts.map