export interface StagingSmokeOptions {
    agentBaseUrl: string;
    webhookSecret: string;
    conversationId: number;
    accountId: number;
    inboxId: number;
    contactId: number;
    contactName: string;
    messageContent: string;
    strictHealth?: boolean;
    timeoutMs?: number;
}
export interface SmokeCheckResult {
    name: string;
    passed: boolean;
    status?: number;
    details?: string;
}
export interface StagingSmokeResult {
    passed: boolean;
    checks: SmokeCheckResult[];
}
type FetchLike = typeof fetch;
export declare function runStagingSmokeTest(options: StagingSmokeOptions, fetchImpl?: FetchLike): Promise<StagingSmokeResult>;
export declare function createSmokeOptionsFromEnv(env: NodeJS.ProcessEnv): StagingSmokeOptions;
export {};
//# sourceMappingURL=stagingSmoke.d.ts.map