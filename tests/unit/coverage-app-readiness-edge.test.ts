import {
  createSmokeOptionsFromEnv,
  runStagingSmokeTest,
  StagingSmokeOptions,
} from '../../src/modules/readiness/stagingSmoke';
import {
  createEvolutionSmokeOptionsFromEnv,
  runEvolutionSmokeTest,
} from '../../src/modules/readiness/evolutionSmoke';

function stagingOptions(overrides: Partial<StagingSmokeOptions> = {}): StagingSmokeOptions {
  return {
    agentBaseUrl: 'https://agent.example.com/',
    webhookSecret: 'secret',
    conversationId: 10,
    accountId: 1,
    inboxId: 2,
    contactId: 3,
    contactName: 'Smoke',
    messageContent: 'Teste',
    timeoutMs: 50,
    ...overrides,
  };
}

function response(options: {
  body?: unknown;
  status?: number;
  jsonError?: Error;
  text?: string;
  textError?: Error;
}): Response {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (options.jsonError) throw options.jsonError;
      return options.body;
    },
    text: async () => {
      if (options.textError) throw options.textError;
      return options.text ?? JSON.stringify(options.body);
    },
  } as Response;
}

describe('staging readiness failure and timeout behavior', () => {
  it('records each network failure without skipping later checks', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('health network error'))
      .mockRejectedValueOnce(new Error('readiness network error'))
      .mockRejectedValueOnce(new Error('webhook network error'));

    const result = await runStagingSmokeTest(stagingOptions(), fetchMock as typeof fetch);

    expect(result.passed).toBe(false);
    expect(result.checks).toEqual([
      { name: 'health', passed: false, details: 'health network error' },
      { name: 'readiness', passed: false, details: 'readiness network error' },
      { name: 'signed_chatwoot_webhook', passed: false, details: 'webhook network error' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('handles non-JSON health, readiness, and webhook responses safely', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      jsonError: new Error('not json'),
      status: 200,
    }));

    const result = await runStagingSmokeTest(stagingOptions(), fetchMock as typeof fetch);

    expect(result.passed).toBe(false);
    expect(result.checks).toEqual([
      { name: 'health', passed: false, status: 200, details: undefined },
      { name: 'readiness', passed: false, status: 200, details: undefined },
      { name: 'signed_chatwoot_webhook', passed: false, status: 200, details: undefined },
    ]);
  });

  it('aborts every hung check at the configured timeout', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted by timeout')), { once: true });
    }));

    const started = Date.now();
    const result = await runStagingSmokeTest(
      stagingOptions({ timeoutMs: 5 }),
      fetchMock as typeof fetch
    );

    expect(Date.now() - started).toBeLessThan(250);
    expect(result.passed).toBe(false);
    expect(result.checks).toHaveLength(3);
    expect(result.checks.every((check) => check.details === 'aborted by timeout')).toBe(true);
  });

  it('uses smoke environment defaults for optional values', () => {
    const options = createSmokeOptionsFromEnv({
      AGENT_BASE_URL: 'https://agent.example.com',
      CHATWOOT_WEBHOOK_SECRET: 'secret',
      SMOKE_CHATWOOT_CONVERSATION_ID: '10',
      SMOKE_CHATWOOT_ACCOUNT_ID: '1',
      SMOKE_CHATWOOT_INBOX_ID: '2',
      SMOKE_CHATWOOT_CONTACT_ID: '3',
    });

    expect(options).toMatchObject({
      contactName: 'Smoke Test',
      messageContent: 'Teste automatico de readiness do agent-secretary.',
      strictHealth: true,
      timeoutMs: undefined,
    });
  });
});

describe('EvolutionAPI readiness failure behavior', () => {
  const baseOptions = {
    evolutionApiUrl: 'https://evolution.example.com/',
    evolutionApiKey: 'key',
    whatsappInstance: 'hospital',
    timeoutMs: 50,
  };

  it.each([
    [{ instance: { state: 'open' } }, true],
    [{ state: 'open' }, true],
    [{ state: 'closed' }, false],
  ] as const)('recognizes supported connection payload %j', async (payload, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(response({ body: payload }));
    const result = await runEvolutionSmokeTest(baseOptions, fetchMock as typeof fetch);
    expect(result.passed).toBe(expected);
  });

  it('falls back to response text and rejects malformed connection payloads', async () => {
    const textFallback = vi.fn().mockResolvedValue(response({
      jsonError: new Error('not json'),
      text: JSON.stringify({ state: 'open' }),
    }));
    await expect(runEvolutionSmokeTest(baseOptions, textFallback as typeof fetch)).resolves.toMatchObject({
      passed: true,
    });

    const malformed = vi.fn().mockResolvedValue(response({
      jsonError: new Error('not json'),
      text: 'not-json',
    }));
    await expect(runEvolutionSmokeTest(baseOptions, malformed as typeof fetch)).resolves.toMatchObject({
      passed: false,
    });
  });

  it('uses an empty detail when neither JSON nor text can be read', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      jsonError: new Error('not json'),
      textError: new Error('no text'),
    }));
    const result = await runEvolutionSmokeTest(baseOptions, fetchMock as typeof fetch);
    expect(result.checks[0]).toMatchObject({ passed: false, details: '' });
  });

  it('records connection and optional message network failures', async () => {
    const connectionFailure = vi.fn().mockRejectedValue(new Error('connection failed'));
    const failedConnection = await runEvolutionSmokeTest(
      baseOptions,
      connectionFailure as typeof fetch
    );
    expect(failedConnection.checks[0]).toEqual({
      name: 'evolution_instance_connection',
      passed: false,
      details: 'connection failed',
    });

    const sendFailure = vi.fn()
      .mockResolvedValueOnce(response({ body: { state: 'open' } }))
      .mockRejectedValueOnce(new Error('send failed'));
    const failedSend = await runEvolutionSmokeTest({
      ...baseOptions,
      sendTestMessage: true,
      testPhoneNumber: '5511999999999',
    }, sendFailure as typeof fetch);
    expect(failedSend.checks[1]).toEqual({
      name: 'evolution_send_test_message',
      passed: false,
      details: 'send failed',
    });
    expect(JSON.parse((sendFailure.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      number: '5511999999999',
      text: 'Teste automatico EvolutionAPI -> WhatsApp.',
    });
  });

  it('uses Evolution environment defaults for optional values', () => {
    const options = createEvolutionSmokeOptionsFromEnv({
      EVOLUTION_API_URL: 'https://evolution.example.com',
      EVOLUTION_API_KEY: 'key',
      WHATSAPP_INSTANCE: 'hospital',
    });
    expect(options).toEqual({
      evolutionApiUrl: 'https://evolution.example.com',
      evolutionApiKey: 'key',
      whatsappInstance: 'hospital',
      testPhoneNumber: undefined,
      testMessage: undefined,
      sendTestMessage: false,
      timeoutMs: undefined,
    });
  });
});
