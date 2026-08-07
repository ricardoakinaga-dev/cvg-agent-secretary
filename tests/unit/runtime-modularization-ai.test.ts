import { beforeEach, describe, expect, it, vi } from 'vitest';
import { metrics, METRICS } from '../../src/shared/metrics';
import { CircuitBreaker } from '../../src/shared/resilience';
import { AIProvider, GenerateInput } from '../../src/modules/ai/types';
import { AIRouter } from '../../src/modules/ai/router';

const input: GenerateInput = {
  message: 'Preciso de ajuda',
  context: {
    contactName: 'Cliente',
    conversationHistory: [],
    memories: [],
    knowledge: [],
  },
};

function provider(name: string, overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    name,
    generate: vi.fn().mockResolvedValue({
      content: `Resposta ${name}`,
      confidence: 0.8,
      provider: name,
    }),
    embed: vi.fn().mockResolvedValue([1, 2, 3]),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('modular AI router contract', () => {
  beforeEach(() => {
    metrics.reset();
  });

  it('selects the configured primary provider through one router contract', async () => {
    const openai = provider('openai');
    const openrouter = provider('openrouter');
    const router = new AIRouter({
      providerType: 'openrouter',
      providers: { openai, openrouter },
    });

    const result = await router.generate(input);

    expect(result.provider).toBe('openrouter');
    expect(openrouter.generate).toHaveBeenCalledWith(input);
    expect(openai.generate).not.toHaveBeenCalled();
    expect(router.getPrimaryProvider()).toBe('openrouter');
  });

  it('uses the alternate adapter once and records the provider switch', async () => {
    const openai = provider('openai', {
      generate: vi.fn().mockRejectedValue(new Error('unavailable')),
    });
    const openrouter = provider('openrouter');
    const router = new AIRouter({ providers: { openai, openrouter } });

    const result = await router.generate(input);

    expect(result.provider).toBe('openrouter');
    expect(openrouter.generate).toHaveBeenCalledWith(input);
    expect(metrics.getCounter(METRICS.OPENAI_REQUESTS_TOTAL)).toBe(1);
    expect(metrics.getCounter(METRICS.OPENROUTER_REQUESTS_TOTAL)).toBe(1);
    expect(metrics.getCounter(METRICS.AI_PROVIDER_SWITCHES, {
      from: 'openai',
      to: 'openrouter',
    })).toBe(1);
  });

  it('returns the safe contract when both adapters fail', async () => {
    const openai = provider('openai', {
      generate: vi.fn().mockRejectedValue(new Error('primary failed')),
    });
    const openrouter = provider('openrouter', {
      generate: vi.fn().mockRejectedValue(new Error('fallback failed')),
    });
    const router = new AIRouter({ providers: { openai, openrouter } });

    await expect(router.generate(input)).resolves.toMatchObject({
      confidence: 0,
      provider: 'none',
      action: { type: 'fallback', reason: 'all_providers_failed' },
    });
  });

  it('allows an open primary circuit to probe again after its reset timeout', async () => {
    const primaryGenerate = vi.fn()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce({
        content: 'Primary recovered',
        confidence: 0.8,
        provider: 'openai',
      });
    const openai = provider('openai', { generate: primaryGenerate });
    const openrouter = provider('openrouter');
    const router = new AIRouter({
      providers: { openai, openrouter },
      primaryCircuitBreaker: new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 0,
        halfOpenRequests: 1,
      }),
    });

    await expect(router.generate(input)).resolves.toMatchObject({ provider: 'openrouter' });
    await expect(router.generate(input)).resolves.toMatchObject({ provider: 'openai' });
    expect(primaryGenerate).toHaveBeenCalledTimes(2);
  });

  it('checks fallback health if the primary health check throws', async () => {
    const openai = provider('openai', {
      healthCheck: vi.fn().mockRejectedValue(new Error('health timeout')),
    });
    const openrouter = provider('openrouter', {
      healthCheck: vi.fn().mockResolvedValue(true),
    });
    const router = new AIRouter({ providers: { openai, openrouter } });

    await expect(router.healthCheck()).resolves.toBe(true);
    expect(openrouter.healthCheck).toHaveBeenCalledOnce();
  });

  it('uses fallback embeddings when the primary adapter fails', async () => {
    const openai = provider('openai', {
      embed: vi.fn().mockRejectedValue(new Error('embedding unavailable')),
    });
    const openrouter = provider('openrouter', {
      embed: vi.fn().mockResolvedValue([4, 5, 6]),
    });
    const router = new AIRouter({ providers: { openai, openrouter } });

    await expect(router.embed('texto')).resolves.toEqual([4, 5, 6]);
  });
});
