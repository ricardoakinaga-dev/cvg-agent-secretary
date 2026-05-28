import { runFullFlowSmokeTest } from '../../src/modules/readiness/fullFlowSmoke';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    AGENT_BASE_URL: 'https://agent.example.com',
    CHATWOOT_WEBHOOK_SECRET: 'secret',
    SMOKE_CHATWOOT_CONVERSATION_ID: '123',
    SMOKE_CHATWOOT_ACCOUNT_ID: '1',
    SMOKE_CHATWOOT_INBOX_ID: '2',
    SMOKE_CHATWOOT_CONTACT_ID: '99',
    EVOLUTION_API_URL: 'https://evolution.example.com',
    EVOLUTION_API_KEY: 'api-key',
    WHATSAPP_INSTANCE: 'cvg',
    ...overrides,
  };
}

describe('full flow smoke test', () => {
  it('passes when agent/Chatwoot checks and EvolutionAPI checks pass', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/health')) return jsonResponse({ status: 'healthy' });
      if (url.endsWith('/ready')) return jsonResponse({ ready: true });
      if (url.endsWith('/webhooks/chatwoot')) return jsonResponse({ success: true });
      if (url.endsWith('/instance/connectionState/cvg')) {
        return jsonResponse({ instance: { connectionStatus: 'open' } });
      }
      return jsonResponse({}, 404);
    });

    const result = await runFullFlowSmokeTest(env(), fetchMock as typeof fetch);

    expect(result.passed).toBe(true);
    expect(result.sections).toEqual([
      expect.objectContaining({
        name: 'agent_chatwoot',
        passed: true,
      }),
      expect.objectContaining({
        name: 'evolutionapi',
        passed: true,
      }),
    ]);
  });

  it('fails when the agent smoke fails even if EvolutionAPI passes', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/health')) return jsonResponse({ status: 'healthy' });
      if (url.endsWith('/ready')) return jsonResponse({ ready: false }, 503);
      if (url.endsWith('/webhooks/chatwoot')) return jsonResponse({ success: true });
      if (url.endsWith('/instance/connectionState/cvg')) {
        return jsonResponse({ instance: { connectionStatus: 'open' } });
      }
      return jsonResponse({}, 404);
    });

    const result = await runFullFlowSmokeTest(env(), fetchMock as typeof fetch);

    expect(result.passed).toBe(false);
    expect(result.sections[0]).toMatchObject({
      name: 'agent_chatwoot',
      passed: false,
    });
    expect(result.sections[1]).toMatchObject({
      name: 'evolutionapi',
      passed: true,
    });
  });

  it('fails when EvolutionAPI is not connected even if agent smoke passes', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/health')) return jsonResponse({ status: 'healthy' });
      if (url.endsWith('/ready')) return jsonResponse({ ready: true });
      if (url.endsWith('/webhooks/chatwoot')) return jsonResponse({ success: true });
      if (url.endsWith('/instance/connectionState/cvg')) {
        return jsonResponse({ instance: { connectionStatus: 'connecting' } });
      }
      return jsonResponse({}, 404);
    });

    const result = await runFullFlowSmokeTest(env(), fetchMock as typeof fetch);

    expect(result.passed).toBe(false);
    expect(result.sections[0]).toMatchObject({
      name: 'agent_chatwoot',
      passed: true,
    });
    expect(result.sections[1]).toMatchObject({
      name: 'evolutionapi',
      passed: false,
    });
  });
});
