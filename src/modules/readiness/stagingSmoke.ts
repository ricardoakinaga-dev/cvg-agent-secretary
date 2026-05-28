import { createHmac } from 'crypto';

export interface StagingSmokeOptions {
  agentBaseUrl: string;
  webhookSecret: string;
  conversationId: number;
  accountId: number;
  inboxId: number;
  contactId: number;
  contactName: string;
  messageContent: string;
  strictHealth?: boolean;
  timeoutMs?: number;
}

export interface SmokeCheckResult {
  name: string;
  passed: boolean;
  status?: number;
  details?: string;
}

export interface StagingSmokeResult {
  passed: boolean;
  checks: SmokeCheckResult[];
}

type FetchLike = typeof fetch;

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function signBody(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(Buffer.from(body)).digest('hex')}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
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

function createWebhookBody(options: StagingSmokeOptions): string {
  return JSON.stringify({
    event: 'message_created',
    message: {
      id: Date.now(),
      content: options.messageContent,
      message_type: 'incoming',
      sender: {
        id: options.contactId,
        name: options.contactName,
        type: 'contact',
      },
      attachments: [],
      private: false,
    },
    conversation: {
      id: options.conversationId,
      uuid: `smoke-${options.conversationId}`,
      account_id: options.accountId,
      inbox_id: options.inboxId,
      status: 'open',
      assignee_id: null,
      contact: {
        id: options.contactId,
        name: options.contactName,
      },
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function runStagingSmokeTest(
  options: StagingSmokeOptions,
  fetchImpl: FetchLike = fetch
): Promise<StagingSmokeResult> {
  const baseUrl = normalizeBaseUrl(options.agentBaseUrl);
  const timeoutMs = options.timeoutMs || 10_000;
  const strictHealth = options.strictHealth ?? true;
  const checks: SmokeCheckResult[] = [];

  try {
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/health`, { method: 'GET' }, timeoutMs);
    const body = await readJson(response);
    const status = isObject(body) ? body.status : undefined;
    const passed = strictHealth
      ? response.ok && status === 'healthy'
      : status === 'healthy' || status === 'degraded';

    checks.push({
      name: 'health',
      passed,
      status: response.status,
      details: isObject(body) ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    checks.push({ name: 'health', passed: false, details: (error as Error).message });
  }

  try {
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/ready`, { method: 'GET' }, timeoutMs);
    const body = await readJson(response);
    const ready = isObject(body) ? body.ready : undefined;

    checks.push({
      name: 'readiness',
      passed: response.ok && ready === true,
      status: response.status,
      details: isObject(body) ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    checks.push({ name: 'readiness', passed: false, details: (error as Error).message });
  }

  try {
    const body = createWebhookBody(options);
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/webhooks/chatwoot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatwoot-signature': signBody(body, options.webhookSecret),
        'x-chatwoot-account-id': String(options.accountId),
      },
      body,
    }, timeoutMs);
    const responseBody = await readJson(response);
    const success = isObject(responseBody) ? responseBody.success : undefined;

    checks.push({
      name: 'signed_chatwoot_webhook',
      passed: response.ok && success === true,
      status: response.status,
      details: isObject(responseBody) ? JSON.stringify(responseBody) : undefined,
    });
  } catch (error) {
    checks.push({ name: 'signed_chatwoot_webhook', passed: false, details: (error as Error).message });
  }

  return {
    passed: checks.every((check) => check.passed),
    checks,
  };
}

export function createSmokeOptionsFromEnv(env: NodeJS.ProcessEnv): StagingSmokeOptions {
  const required = [
    'AGENT_BASE_URL',
    'CHATWOOT_WEBHOOK_SECRET',
    'SMOKE_CHATWOOT_CONVERSATION_ID',
    'SMOKE_CHATWOOT_ACCOUNT_ID',
    'SMOKE_CHATWOOT_INBOX_ID',
    'SMOKE_CHATWOOT_CONTACT_ID',
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing smoke test environment variables: ${missing.join(', ')}`);
  }

  return {
    agentBaseUrl: env.AGENT_BASE_URL as string,
    webhookSecret: env.CHATWOOT_WEBHOOK_SECRET as string,
    conversationId: Number(env.SMOKE_CHATWOOT_CONVERSATION_ID),
    accountId: Number(env.SMOKE_CHATWOOT_ACCOUNT_ID),
    inboxId: Number(env.SMOKE_CHATWOOT_INBOX_ID),
    contactId: Number(env.SMOKE_CHATWOOT_CONTACT_ID),
    contactName: env.SMOKE_CHATWOOT_CONTACT_NAME || 'Smoke Test',
    messageContent: env.SMOKE_MESSAGE_CONTENT || 'Teste automatico de readiness do agent-secretary.',
    strictHealth: env.SMOKE_STRICT_HEALTH !== 'false',
    timeoutMs: env.SMOKE_TIMEOUT_MS ? Number(env.SMOKE_TIMEOUT_MS) : undefined,
  };
}
