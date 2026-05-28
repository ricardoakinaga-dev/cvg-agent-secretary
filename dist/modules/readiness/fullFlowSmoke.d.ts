export interface FullFlowSmokeResult {
    passed: boolean;
    sections: Array<{
        name: 'agent_chatwoot' | 'evolutionapi';
        passed: boolean;
        checks: Array<{
            name: string;
            passed: boolean;
            status?: number;
            details?: string;
        }>;
    }>;
}
type FetchLike = typeof fetch;
export declare function runFullFlowSmokeTest(env: NodeJS.ProcessEnv, fetchImpl?: FetchLike): Promise<FullFlowSmokeResult>;
export {};
//# sourceMappingURL=fullFlowSmoke.d.ts.map