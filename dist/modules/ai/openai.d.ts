import { AIProvider, GenerateInput, GenerateOutput } from './types';
export declare class OpenAIProvider implements AIProvider {
    name: string;
    generate(input: GenerateInput): Promise<GenerateOutput>;
    embed(text: string): Promise<number[]>;
    healthCheck(): Promise<boolean>;
}
export declare const openAIProvider: OpenAIProvider;
//# sourceMappingURL=openai.d.ts.map