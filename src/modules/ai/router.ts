import { AIProvider, GenerateInput, GenerateOutput, ProviderType } from './types';
import { openAIProvider } from './openai';
import { openRouterProvider } from './openrouter';
import { config } from '../../config';
import { logger } from '../logging';
import { metrics, METRICS } from '../../shared/metrics';
import { CircuitBreaker } from '../../shared/resilience';

export class AIRouter {
  private primaryProvider: AIProvider;
  private fallbackProvider: AIProvider;
  private providerType: ProviderType;
  private primaryCircuitBreaker: CircuitBreaker;
  private fallbackCircuitBreaker: CircuitBreaker;

  constructor() {
    this.providerType = this.resolveProviderType(config.aiProvider);
    
    if (this.providerType === 'openrouter') {
      this.primaryProvider = openRouterProvider;
      this.fallbackProvider = openAIProvider;
    } else {
      this.primaryProvider = openAIProvider;
      this.fallbackProvider = openRouterProvider;
    }

    this.primaryCircuitBreaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30000 });
    this.fallbackCircuitBreaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60000 });

    logger.info('AI Router initialized', {
      primary: this.primaryProvider.name,
      fallback: this.fallbackProvider.name,
    });
  }

  private resolveProviderType(type: ProviderType): ProviderType {
    if (type === 'auto') {
      return 'openai';
    }
    return type;
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const startTime = Date.now();
    const primaryProviderName = this.primaryProvider.name;

    if (primaryProviderName === 'openai') {
      metrics.incrementCounter(METRICS.OPENAI_REQUESTS_TOTAL);
    } else {
      metrics.incrementCounter(METRICS.OPENROUTER_REQUESTS_TOTAL);
    }

    const primaryOpen = this.primaryCircuitBreaker.getStatus() !== 'open';
    
    if (primaryOpen) {
      try {
        const result = await this.primaryCircuitBreaker.execute(() => this.primaryProvider.generate(input));
        const latency = Date.now() - startTime;
        
        if (primaryProviderName === 'openai') {
          metrics.recordHistogram(METRICS.OPENAI_REQUESTS_LATENCY, latency);
        } else {
          metrics.recordHistogram(METRICS.OPENROUTER_REQUESTS_LATENCY, latency);
        }
        
        logger.info('Primary provider succeeded', { provider: this.primaryProvider.name, latency });
        return result;
      } catch (error) {
        logger.warn(`Primary provider failed: ${(error as Error).message}`, {
          primary: this.primaryProvider.name,
        });
        
        if (primaryProviderName === 'openai') {
          metrics.incrementCounter(METRICS.OPENAI_REQUESTS_ERRORS, {
            error: (error as Error).message.substring(0, 50),
          });
        } else {
          metrics.incrementCounter(METRICS.OPENROUTER_REQUESTS_ERRORS, {
            error: (error as Error).message.substring(0, 50),
          });
        }
      }
    } else {
      logger.warn('Primary circuit breaker open, skipping to fallback', { provider: this.primaryProvider.name });
    }

    const fallbackOpen = this.fallbackCircuitBreaker.getStatus() !== 'open';
    
    if (fallbackOpen) {
      try {
        const fallbackStartTime = Date.now();
        const fallbackResult = await this.fallbackCircuitBreaker.execute(() => this.fallbackProvider.generate(input));
        const fallbackLatency = Date.now() - fallbackStartTime;
        
        if (this.fallbackProvider.name === 'openai') {
          metrics.recordHistogram(METRICS.OPENAI_REQUESTS_LATENCY, fallbackLatency);
        } else {
          metrics.recordHistogram(METRICS.OPENROUTER_REQUESTS_LATENCY, fallbackLatency);
        }
        
        metrics.incrementCounter(METRICS.OPENAI_REQUESTS_FALLBACK, {
          from: this.primaryProvider.name,
          to: this.fallbackProvider.name,
        });
        metrics.incrementCounter(METRICS.AI_PROVIDER_SWITCHES, {
          from: this.primaryProvider.name,
          to: this.fallbackProvider.name,
        });
        
        logger.info('Fallback provider succeeded', { provider: this.fallbackProvider.name, fallbackLatency });
        return fallbackResult;
      } catch (fallbackError) {
        logger.error('Fallback provider also failed', fallbackError as Error);
        
        if (this.fallbackProvider.name === 'openai') {
          metrics.incrementCounter(METRICS.OPENAI_REQUESTS_ERRORS, {
            error: (fallbackError as Error).message.substring(0, 50),
          });
        } else {
          metrics.incrementCounter(METRICS.OPENROUTER_REQUESTS_ERRORS, {
            error: (fallbackError as Error).message.substring(0, 50),
          });
        }
      }
    } else {
      logger.error('Both circuit breakers open', undefined, { primary: this.primaryProvider.name, fallback: this.fallbackProvider.name });
    }

    return {
      content: 'Peço desculpas, estou tendo dificuldades para processar sua solicitação neste momento. Um de nossos atendentes logo irá ajudá-lo.',
      confidence: 0,
      action: {
        type: 'fallback' as const,
        reason: 'all_providers_failed',
      },
      provider: 'none',
    };
  }

  async embed(text: string): Promise<number[]> {
    try {
      return await this.primaryProvider.embed?.(text) || [];
    } catch {
      try {
        return await this.fallbackProvider.embed?.(text) || [];
      } catch (error) {
        logger.error('Embedding failed on all providers', error as Error);
        return [];
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    const primaryHealth = await this.primaryProvider.healthCheck();
    if (primaryHealth) return true;

    const fallbackHealth = await this.fallbackProvider.healthCheck();
    return fallbackHealth;
  }

  getPrimaryProvider(): string {
    return this.primaryProvider.name;
  }

  getFallbackProvider(): string {
    return this.fallbackProvider.name;
  }

  getProviderType(): ProviderType {
    return this.providerType;
  }
}

export const aiRouter = new AIRouter();
