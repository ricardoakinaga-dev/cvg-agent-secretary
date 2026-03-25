import { GenerateInput, GenerateOutput, ProviderType } from './types';
export declare class AIRouter {
    private primaryProvider;
    private fallbackProvider;
    private providerType;
    private primaryCircuitBreaker;
    private fallbackCircuitBreaker;
    constructor();
    private resolveProviderType;
    generate(input: GenerateInput): Promise<GenerateOutput>;
    embed(text: string): Promise<number[]>;
    healthCheck(): Promise<boolean>;
    getPrimaryProvider(): string;
    getFallbackProvider(): string;
    getProviderType(): ProviderType;
}
export declare const aiRouter: AIRouter;
//# sourceMappingURL=router.d.ts.map