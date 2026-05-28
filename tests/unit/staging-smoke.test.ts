import { createHmac } from 'crypto';
import {
  createSmokeOptionsFromEnv,
  runStagingSmokeTest,
  StagingSmokeOptions,
} from '../../src/modules/readiness/stagingSmoke';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function createOptions(overrides: Partial<StagingSmokeOptions> = {}): StagingSmokeOptions {
  return {
    agentBaseUrl: 'https://agent.example.com/',
    webhookSecret: 'secret',
    conversationId: 123,
    accountId: 1,
    inboxId: 2,
    contactId: 99,
    contactName: 'Maria',
    messageContent: 'Quero agendar uma consulta',
    timeoutMs: 1000,
    ...overrides,
  };
}

describe('staging smoke test', () => {
  it('checks health, readiness and signed Chatwoot webhook successfully', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'healthy' }))
      .mockResolvedValueOnce(jsonResponse({ ready: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    const result = await runStagingSmokeTest(createOptions(), fetchMock as typeof fetch);

    expect(result.passed).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual([
      'health',
      'readiness',
      'signed_chatwoot_webhook',
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://agent.example.com/health',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/ready',
      expect.objectContaining({ method: 'GET' })
    );

    const webhookCall = fetchMock.mock.calls[2];
    const requestInit = webhookCall[1] as RequestInit;
    const body = requestInit.body as string;
    const expectedSignature = `sha256=${createHmac('sha256', 'secret').update(Buffer.from(body)).digest('hex')}`;

    expect(webhookCall[0]).toBe('https://agent.example.com/webhooks/chatwoot');
    expect(requestInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-chatwoot-account-id': '1',
      'x-chatwoot-signature': expectedSignature,
    });
    expect(JSON.parse(body)).toMatchObject({
      event: 'message_created',
      message: {
        content: 'Quero agendar uma consulta',
        message_type: 'incoming',
      },
      conversation: {
        id: 123,
        account_id: 1,
        inbox_id: 2,
      },
    });
  });

  it('allows degraded health when strict health is disabled', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'degraded' }, 503))
      .mockResolvedValueOnce(jsonResponse({ ready: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    const result = await runStagingSmokeTest(
      createOptions({ strictHealth: false }),
      fetchMock as typeof fetch
    );

    expect(result.checks[0]).toMatchObject({
      name: 'health',
      passed: true,
      status: 503,
    });
    expect(result.passed).toBe(true);
  });

  it('fails when readiness is false or webhook is rejected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'healthy' }))
      .mockResolvedValueOnce(jsonResponse({ ready: false }, 503))
      .mockResolvedValueOnce(jsonResponse({ success: false }, 401));

    const result = await runStagingSmokeTest(createOptions(), fetchMock as typeof fetch);

    expect(result.passed).toBe(false);
    expect(result.checks).toEqual([
      expect.objectContaining({ name: 'health', passed: true }),
      expect.objectContaining({ name: 'readiness', passed: false, status: 503 }),
      expect.objectContaining({ name: 'signed_chatwoot_webhook', passed: false, status: 401 }),
    ]);
  });

  it('creates options from environment variables', () => {
    const options = createSmokeOptionsFromEnv({
      AGENT_BASE_URL: 'https://agent.example.com',
      CHATWOOT_WEBHOOK_SECRET: 'secret',
      SMOKE_CHATWOOT_CONVERSATION_ID: '123',
      SMOKE_CHATWOOT_ACCOUNT_ID: '1',
      SMOKE_CHATWOOT_INBOX_ID: '2',
      SMOKE_CHATWOOT_CONTACT_ID: '99',
      SMOKE_CHATWOOT_CONTACT_NAME: 'Maria',
      SMOKE_MESSAGE_CONTENT: 'Mensagem',
      SMOKE_STRICT_HEALTH: 'false',
      SMOKE_TIMEOUT_MS: '5000',
    });

    expect(options).toEqual({
      agentBaseUrl: 'https://agent.example.com',
      webhookSecret: 'secret',
      conversationId: 123,
      accountId: 1,
      inboxId: 2,
      contactId: 99,
      contactName: 'Maria',
      messageContent: 'Mensagem',
      strictHealth: false,
      timeoutMs: 5000,
    });
  });

  it('reports missing required environment variables', () => {
    expect(() => createSmokeOptionsFromEnv({})).toThrow(
      'Missing smoke test environment variables: AGENT_BASE_URL, CHATWOOT_WEBHOOK_SECRET, SMOKE_CHATWOOT_CONVERSATION_ID, SMOKE_CHATWOOT_ACCOUNT_ID, SMOKE_CHATWOOT_INBOX_ID, SMOKE_CHATWOOT_CONTACT_ID'
    );
  });
});
