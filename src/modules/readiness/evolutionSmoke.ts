export interface EvolutionSmokeOptions {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  whatsappInstance: string;
  testPhoneNumber?: string;
  testMessage?: string;
  sendTestMessage?: boolean;
  timeoutMs?: number;
}

export interface EvolutionSmokeCheck {
  name: string;
  passed: boolean;
  status?: number;
  details?: string;
}

export interface EvolutionSmokeResult {
  passed: boolean;
  checks: EvolutionSmokeCheck[];
}

type FetchLike = typeof fetch;

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

async function readJsonOrText(response: Response): Promise<string> {
  try {
    return JSON.stringify(await response.json());
  } catch {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isConnectedPayload(payload: string): boolean {
  try {
    const parsed = JSON.parse(payload) as {
      instance?: { connectionStatus?: string; state?: string };
      state?: string;
    };
    return (
      parsed.instance?.connectionStatus === 'open' ||
      parsed.instance?.state === 'open' ||
      parsed.state === 'open'
    );
  } catch {
    return false;
  }
}

export async function runEvolutionSmokeTest(
  options: EvolutionSmokeOptions,
  fetchImpl: FetchLike = fetch
): Promise<EvolutionSmokeResult> {
  const baseUrl = normalizeBaseUrl(options.evolutionApiUrl);
  const timeoutMs = options.timeoutMs || 10_000;
  const checks: EvolutionSmokeCheck[] = [];

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/instance/connectionState/${options.whatsappInstance}`,
      {
        method: 'GET',
        headers: { apikey: options.evolutionApiKey },
      },
      timeoutMs
    );
    const details = await readJsonOrText(response);

    checks.push({
      name: 'evolution_instance_connection',
      passed: response.ok && isConnectedPayload(details),
      status: response.status,
      details,
    });
  } catch (error) {
    checks.push({
      name: 'evolution_instance_connection',
      passed: false,
      details: (error as Error).message,
    });
  }

  if (options.sendTestMessage) {
    if (!options.testPhoneNumber) {
      checks.push({
        name: 'evolution_send_test_message',
        passed: false,
        details: 'TEST_WHATSAPP_NUMBER is required when SEND_EVOLUTION_TEST_MESSAGE=true',
      });
    } else {
      try {
        const response = await fetchWithTimeout(
          fetchImpl,
          `${baseUrl}/message/sendText/${options.whatsappInstance}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: options.evolutionApiKey,
            },
            body: JSON.stringify({
              number: options.testPhoneNumber,
              text: options.testMessage || 'Teste automatico EvolutionAPI -> WhatsApp.',
            }),
          },
          timeoutMs
        );
        const details = await readJsonOrText(response);

        checks.push({
          name: 'evolution_send_test_message',
          passed: response.ok,
          status: response.status,
          details,
        });
      } catch (error) {
        checks.push({
          name: 'evolution_send_test_message',
          passed: false,
          details: (error as Error).message,
        });
      }
    }
  }

  return {
    passed: checks.every((check) => check.passed),
    checks,
  };
}

export function createEvolutionSmokeOptionsFromEnv(env: NodeJS.ProcessEnv): EvolutionSmokeOptions {
  const required = ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'WHATSAPP_INSTANCE'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing Evolution smoke test environment variables: ${missing.join(', ')}`);
  }

  return {
    evolutionApiUrl: env.EVOLUTION_API_URL as string,
    evolutionApiKey: env.EVOLUTION_API_KEY as string,
    whatsappInstance: env.WHATSAPP_INSTANCE as string,
    testPhoneNumber: env.TEST_WHATSAPP_NUMBER,
    testMessage: env.EVOLUTION_TEST_MESSAGE,
    sendTestMessage: env.SEND_EVOLUTION_TEST_MESSAGE === 'true',
    timeoutMs: env.SMOKE_TIMEOUT_MS ? Number(env.SMOKE_TIMEOUT_MS) : undefined,
  };
}
