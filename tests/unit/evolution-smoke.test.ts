import {
  createEvolutionSmokeOptionsFromEnv,
  runEvolutionSmokeTest,
} from '../../src/modules/readiness/evolutionSmoke';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('EvolutionAPI smoke test', () => {
  it('checks the configured instance connection state', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      instance: { connectionStatus: 'open' },
    }));

    const result = await runEvolutionSmokeTest({
      evolutionApiUrl: 'https://evolution.example.com/',
      evolutionApiKey: 'api-key',
      whatsappInstance: 'cvg',
      timeoutMs: 1000,
    }, fetchMock as typeof fetch);

    expect(result.passed).toBe(true);
    expect(result.checks).toEqual([
      expect.objectContaining({
        name: 'evolution_instance_connection',
        passed: true,
        status: 200,
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://evolution.example.com/instance/connectionState/cvg',
      expect.objectContaining({
        method: 'GET',
        headers: { apikey: 'api-key' },
      })
    );
  });

  it('fails when the instance is not open', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      instance: { connectionStatus: 'connecting' },
    }));

    const result = await runEvolutionSmokeTest({
      evolutionApiUrl: 'https://evolution.example.com',
      evolutionApiKey: 'api-key',
      whatsappInstance: 'cvg',
    }, fetchMock as typeof fetch);

    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({
      name: 'evolution_instance_connection',
      passed: false,
      status: 200,
    });
  });

  it('optionally sends a test WhatsApp message', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ instance: { connectionStatus: 'open' } }))
      .mockResolvedValueOnce(jsonResponse({ key: { id: 'message-1' } }));

    const result = await runEvolutionSmokeTest({
      evolutionApiUrl: 'https://evolution.example.com',
      evolutionApiKey: 'api-key',
      whatsappInstance: 'cvg',
      sendTestMessage: true,
      testPhoneNumber: '5511999999999',
      testMessage: 'Smoke',
    }, fetchMock as typeof fetch);

    expect(result.passed).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://evolution.example.com/message/sendText/cvg',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: 'api-key',
        },
        body: JSON.stringify({
          number: '5511999999999',
          text: 'Smoke',
        }),
      })
    );
  });

  it('does not send a test message without explicit opt-in', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      instance: { connectionStatus: 'open' },
    }));

    const result = await runEvolutionSmokeTest({
      evolutionApiUrl: 'https://evolution.example.com',
      evolutionApiKey: 'api-key',
      whatsappInstance: 'cvg',
      testPhoneNumber: '5511999999999',
    }, fetchMock as typeof fetch);

    expect(result.passed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails safely when send test message is enabled without a phone number', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      instance: { connectionStatus: 'open' },
    }));

    const result = await runEvolutionSmokeTest({
      evolutionApiUrl: 'https://evolution.example.com',
      evolutionApiKey: 'api-key',
      whatsappInstance: 'cvg',
      sendTestMessage: true,
    }, fetchMock as typeof fetch);

    expect(result.passed).toBe(false);
    expect(result.checks[1]).toEqual({
      name: 'evolution_send_test_message',
      passed: false,
      details: 'TEST_WHATSAPP_NUMBER is required when SEND_EVOLUTION_TEST_MESSAGE=true',
    });
  });

  it('creates options from environment variables', () => {
    const options = createEvolutionSmokeOptionsFromEnv({
      EVOLUTION_API_URL: 'https://evolution.example.com',
      EVOLUTION_API_KEY: 'api-key',
      WHATSAPP_INSTANCE: 'cvg',
      TEST_WHATSAPP_NUMBER: '5511999999999',
      EVOLUTION_TEST_MESSAGE: 'Smoke',
      SEND_EVOLUTION_TEST_MESSAGE: 'true',
      SMOKE_TIMEOUT_MS: '5000',
    });

    expect(options).toEqual({
      evolutionApiUrl: 'https://evolution.example.com',
      evolutionApiKey: 'api-key',
      whatsappInstance: 'cvg',
      testPhoneNumber: '5511999999999',
      testMessage: 'Smoke',
      sendTestMessage: true,
      timeoutMs: 5000,
    });
  });

  it('reports missing required environment variables', () => {
    expect(() => createEvolutionSmokeOptionsFromEnv({})).toThrow(
      'Missing Evolution smoke test environment variables: EVOLUTION_API_URL, EVOLUTION_API_KEY, WHATSAPP_INSTANCE'
    );
  });
});
