import { AIProvider, GenerateInput, GenerateOutput } from './types';
import { openaiClient } from '../openai/client';

export class OpenAIProvider implements AIProvider {
  name = 'openai';

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const response = await openaiClient.generateResponse(
      input.message,
      input.context
    );
    
    return {
      content: response.content,
      confidence: response.confidence,
      action: response.action,
      provider: 'openai',
    };
  }

  async embed(text: string): Promise<number[]> {
    return openaiClient.generateEmbedding(text);
  }

  async healthCheck(): Promise<boolean> {
    return openaiClient.healthCheck();
  }
}

export const openAIProvider = new OpenAIProvider();
