const providerMocks = vi.hoisted(() => ({
  openaiGenerate: vi.fn(),
  openrouterGenerate: vi.fn(),
}));

vi.mock('../../src/modules/ai/openai', () => ({
  openAIProvider: {
    name: 'openai',
    generate: providerMocks.openaiGenerate,
    healthCheck: vi.fn(),
  },
}));

vi.mock('../../src/modules/ai/openrouter', () => ({
  openRouterProvider: {
    name: 'openrouter',
    generate: providerMocks.openrouterGenerate,
    healthCheck: vi.fn(),
  },
}));

vi.mock('../../src/config', () => ({
  config: { aiProvider: 'auto' },
}));

vi.mock('../../src/modules/logging', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { AIRouter } from '../../src/modules/ai/router';
import { metrics, METRICS } from '../../src/shared/metrics';

describe('AI router provider metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metrics.reset();
  });

  it('counts each provider attempt once when failover is used', async () => {
    providerMocks.openaiGenerate.mockRejectedValueOnce(new Error('primary unavailable'));
    providerMocks.openrouterGenerate.mockResolvedValueOnce({
      content: 'Resposta segura',
      confidence: 0.8,
      provider: 'openrouter',
    });

    const router = new AIRouter();
    const result = await router.generate({
      message: 'Olá',
      context: {
        contactName: 'Cliente',
        conversationHistory: [],
        memories: [],
        knowledge: [],
      },
    });

    expect(result.provider).toBe('openrouter');
    expect(metrics.getCounter(METRICS.OPENAI_REQUESTS_TOTAL)).toBe(1);
    expect(metrics.getCounter(METRICS.OPENAI_REQUESTS_ERRORS)).toBe(1);
    expect(metrics.getCounter(METRICS.OPENROUTER_REQUESTS_TOTAL)).toBe(1);
    expect(metrics.getCounter(METRICS.OPENROUTER_REQUESTS_ERRORS)).toBe(0);
  });
});
