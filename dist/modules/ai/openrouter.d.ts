import { AIProvider, GenerateInput, GenerateOutput } from './types';
export declare class OpenRouterProvider implements AIProvider {
    name: string;
    private apiKey;
    private model;
    constructor();
    generate(input: GenerateInput): Promise<GenerateOutput>;
    embed(text: string): Promise<number[]>;
    healthCheck(): Promise<boolean>;
    private buildSystemPrompt;
    private buildUserMessage;
    private getFallbackResponse;
}
export declare const openRouterProvider: OpenRouterProvider;
//# sourceMappingURL=openrouter.d.ts.map