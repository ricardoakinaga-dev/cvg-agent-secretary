export interface EvolutionSmokeOptions {
    evolutionApiUrl: string;
    evolutionApiKey: string;
    whatsappInstance: string;
    testPhoneNumber?: string;
    testMessage?: string;
    sendTestMessage?: boolean;
    timeoutMs?: number;
}
export interface EvolutionSmokeCheck {
    name: string;
    passed: boolean;
    status?: number;
    details?: string;
}
export interface EvolutionSmokeResult {
    passed: boolean;
    checks: EvolutionSmokeCheck[];
}
type FetchLike = typeof fetch;
export declare function runEvolutionSmokeTest(options: EvolutionSmokeOptions, fetchImpl?: FetchLike): Promise<EvolutionSmokeResult>;
export declare function createEvolutionSmokeOptionsFromEnv(env: NodeJS.ProcessEnv): EvolutionSmokeOptions;
export {};
//# sourceMappingURL=evolutionSmoke.d.ts.map