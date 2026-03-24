import { AgentResponse, KnowledgeChunk } from '../../shared/types';
export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface AgentContext {
    contactName: string;
    conversationHistory: string[];
    memories: string[];
    pets?: Array<{
        id: string;
        name: string;
        species: string;
        breed: string | null;
    }>;
    knowledge: KnowledgeChunk[];
}
declare class OpenAIClient {
    private client;
    private model;
    private maxTokens;
    private temperature;
    constructor();
    /**
     * Build messages array for OpenAI API
     */
    private buildMessages;
    /**
     * Generate a response using OpenAI
     */
    generateResponse(userMessage: string, context: AgentContext): Promise<AgentResponse>;
    /**
     * Generate embedding for knowledge search
     */
    generateEmbedding(text: string): Promise<number[]>;
    /**
     * Health check
     */
    healthCheck(): Promise<boolean>;
}
export declare const openaiClient: OpenAIClient;
export {};
//# sourceMappingURL=client.d.ts.map