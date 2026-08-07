import { config } from '../../config';
import { metrics, METRICS } from '../../shared/metrics';
import { CircuitBreaker } from '../../shared/resilience';
import { logger } from '../logging';
import { openAIProvider } from './openai';
import { openRouterProvider } from './openrouter';
import { AIProvider, GenerateInput, GenerateOutput, ProviderType } from './types';

function allProvidersFailedResponse(): GenerateOutput {
  return {
    content: 'Peço desculpas, estou tendo dificuldades para processar sua solicitação neste momento. Um de nossos atendentes logo irá ajudá-lo.',
    confidence: 0,
    action: {
      type: 'fallback',
      reason: 'all_providers_failed',
    },
    provider: 'none',
  };
}

interface ProviderMetrics {
  total: string;
  errors: string;
  latency: string;
}

export interface AIRouterOptions {
  providerType?: ProviderType;
  providers?: {
    openai?: AIProvider;
    openrouter?: AIProvider;
  };
  primaryCircuitBreaker?: CircuitBreaker;
  fallbackCircuitBreaker?: CircuitBreaker;
}

function metricsFor(provider: AIProvider): ProviderMetrics {
  if (provider.name === 'openai') {
    return {
      total: METRICS.OPENAI_REQUESTS_TOTAL,
      errors: METRICS.OPENAI_REQUESTS_ERRORS,
      latency: METRICS.OPENAI_REQUESTS_LATENCY,
    };
  }

  return {
    total: METRICS.OPENROUTER_REQUESTS_TOTAL,
    errors: METRICS.OPENROUTER_REQUESTS_ERRORS,
    latency: METRICS.OPENROUTER_REQUESTS_LATENCY,
  };
}

export class AIRouter {
  private readonly primaryProvider: AIProvider;
  private readonly fallbackProvider: AIProvider;
  private readonly providerType: ProviderType;
  private readonly primaryCircuitBreaker: CircuitBreaker;
  private readonly fallbackCircuitBreaker: CircuitBreaker;

  constructor(options: AIRouterOptions = {}) {
    this.providerType = this.resolveProviderType(options.providerType ?? config.aiProvider);
    const providers = {
      openai: options.providers?.openai ?? openAIProvider,
      openrouter: options.providers?.openrouter ?? openRouterProvider,
    };

    if (this.providerType === 'openrouter') {
      this.primaryProvider = providers.openrouter;
      this.fallbackProvider = providers.openai;
    } else {
      this.primaryProvider = providers.openai;
      this.fallbackProvider = providers.openrouter;
    }

    this.primaryCircuitBreaker = options.primaryCircuitBreaker
      ?? new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30_000 });
    this.fallbackCircuitBreaker = options.fallbackCircuitBreaker
      ?? new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60_000 });

    logger.info('AI Router initialized', {
      primary: this.primaryProvider.name,
      fallback: this.fallbackProvider.name,
    });
  }

  private resolveProviderType(type: ProviderType): ProviderType {
    return type === 'auto' ? 'openai' : type;
  }

  private async attemptGeneration(params: {
    role: 'primary' | 'fallback';
    provider: AIProvider;
    circuitBreaker: CircuitBreaker;
    input: GenerateInput;
  }): Promise<GenerateOutput | undefined> {
    const { role, provider, circuitBreaker, input } = params;
    const providerMetrics = metricsFor(provider);
    metrics.incrementCounter(providerMetrics.total);
    const startedAt = Date.now();

    try {
      const result = await circuitBreaker.execute(() => provider.generate(input));
      const latency = Date.now() - startedAt;
      metrics.recordHistogram(providerMetrics.latency, latency);

      if (role === 'fallback') {
        metrics.incrementCounter(
          this.primaryProvider.name === 'openai'
            ? METRICS.OPENAI_REQUESTS_FALLBACK
            : METRICS.OPENROUTER_REQUESTS_FALLBACK
        );
        metrics.incrementCounter(METRICS.AI_PROVIDER_SWITCHES, {
          from: this.primaryProvider.name,
          to: provider.name,
        });
      }

      logger.info(`${role === 'primary' ? 'Primary' : 'Fallback'} provider succeeded`, {
        provider: provider.name,
        latency,
      });
      return result;
    } catch (error) {
      metrics.incrementCounter(providerMetrics.errors);
      if (role === 'primary') {
        logger.warn(`Primary provider failed: ${(error as Error).message}`, {
          primary: provider.name,
        });
      } else {
        logger.error('Fallback provider also failed', error as Error);
      }
      return undefined;
    }
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const primaryResult = await this.attemptGeneration({
      role: 'primary',
      provider: this.primaryProvider,
      circuitBreaker: this.primaryCircuitBreaker,
      input,
    });
    if (primaryResult) {
      return primaryResult;
    }

    const fallbackResult = await this.attemptGeneration({
      role: 'fallback',
      provider: this.fallbackProvider,
      circuitBreaker: this.fallbackCircuitBreaker,
      input,
    });
    return fallbackResult ?? allProvidersFailedResponse();
  }

  async embed(text: string): Promise<number[]> {
    try {
      if (this.primaryProvider.embed) {
        return await this.primaryProvider.embed(text);
      }
    } catch (error) {
      logger.warn('Primary embedding provider failed', {
        provider: this.primaryProvider.name,
        error: (error as Error).message,
      });
    }

    try {
      return this.fallbackProvider.embed
        ? await this.fallbackProvider.embed(text)
        : [];
    } catch (error) {
      logger.error('Embedding failed on all providers', error as Error);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (await this.primaryProvider.healthCheck()) {
        return true;
      }
    } catch (error) {
      logger.warn('Primary AI provider health check failed', {
        provider: this.primaryProvider.name,
        error: (error as Error).message,
      });
    }

    try {
      return await this.fallbackProvider.healthCheck();
    } catch (error) {
      logger.error('AI provider health checks failed', error as Error, {
        fallback: this.fallbackProvider.name,
      });
      return false;
    }
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
