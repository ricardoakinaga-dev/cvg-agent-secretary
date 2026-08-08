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
  /** Optional real Chatwoot verification for a message already persisted there. */
  chatwootApiUrl?: string;
  chatwootApiToken?: string;
  messageId?: number;
  responseTimeoutMs?: number;
  responsePollMs?: number;
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

function signBody(body: string, timestamp: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
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

interface ChatwootSmokeMessage {
  id: number;
  content?: string;
  message_type?: 'incoming' | 'outgoing' | 0 | 1;
  private?: boolean;
  content_attributes?: { cvg_idempotency_key?: string };
}

function createWebhookBody(options: StagingSmokeOptions, messageId: number, content: string): string {
  return JSON.stringify({
    event: 'message_created',
    message: {
      id: messageId,
      content,
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

function normalizeChatwootApiUrl(url: string): string {
  return url.replace(/\/$/, '');
}

async function readChatwootMessages(
  options: StagingSmokeOptions,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<ChatwootSmokeMessage[]> {
  if (!options.chatwootApiUrl || !options.chatwootApiToken) {
    throw new Error('Chatwoot API credentials are required for real message verification');
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    `${normalizeChatwootApiUrl(options.chatwootApiUrl)}/api/v1/accounts/${options.accountId}/conversations/${options.conversationId}/messages`,
    {
      method: 'GET',
      headers: { api_access_token: options.chatwootApiToken },
    },
    timeoutMs
  );
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(`Chatwoot message lookup failed with status ${response.status}`);
  }

  const messages = Array.isArray(body)
    ? body
    : isObject(body) && Array.isArray(body.payload) ? body.payload : [];
  return messages.filter((message): message is ChatwootSmokeMessage => (
    isObject(message) && typeof message.id === 'number'
  ));
}

async function waitForChatwootResponse(
  options: StagingSmokeOptions,
  fetchImpl: FetchLike,
  idempotencyKey: string,
  timeoutMs: number
): Promise<ChatwootSmokeMessage | null> {
  const deadline = Date.now() + (options.responseTimeoutMs ?? 30_000);
  const pollMs = Math.max(1, options.responsePollMs ?? 1_000);

  do {
    const messages = await readChatwootMessages(options, fetchImpl, timeoutMs);
    const response = messages.find((message) => (
      (message.message_type === 'outgoing' || message.message_type === 1)
      && message.content_attributes?.cvg_idempotency_key === idempotencyKey
    ));
    if (response) return response;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(1, deadline - Date.now()))));
  } while (Date.now() < deadline);

  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeNetworkErrorDetails(): string {
  return 'network request failed; inspect the provider-side trace with restricted access';
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  return value === undefined || value === '' ? undefined : parsePositiveInteger(value, name);
}

export async function runStagingSmokeTest(
  options: StagingSmokeOptions,
  fetchImpl: FetchLike = fetch
): Promise<StagingSmokeResult> {
  const baseUrl = normalizeBaseUrl(options.agentBaseUrl);
  const timeoutMs = options.timeoutMs || 10_000;
  const strictHealth = options.strictHealth ?? true;
  const checks: SmokeCheckResult[] = [];
  const messageId = options.messageId ?? Date.now();
  let messageContent = options.messageContent;
  let inboundVerificationPassed = true;

  if (options.messageId !== undefined) {
    try {
      const messages = await readChatwootMessages(options, fetchImpl, timeoutMs);
      const inbound = messages.find((message) => message.id === options.messageId);
      const isIncoming = inbound?.message_type === 'incoming' || inbound?.message_type === 0;
      const passed = Boolean(inbound && isIncoming && inbound.private !== true);
      if (passed && typeof inbound?.content === 'string' && inbound.content.length > 0) {
        messageContent = inbound.content;
      }
      checks.push({
        name: 'chatwoot_inbound_message',
        passed,
        details: passed
          ? `Chatwoot message ${options.messageId} exists as public incoming`
          : `Chatwoot message ${options.messageId} was not found as a public incoming message`,
      });
      inboundVerificationPassed = passed;
    } catch {
      checks.push({ name: 'chatwoot_inbound_message', passed: false, details: safeNetworkErrorDetails() });
      inboundVerificationPassed = false;
    }
  }

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
      details: `HTTP ${response.status}; status=${typeof status === 'string' ? status : 'unknown'}`,
    });
  } catch {
    checks.push({ name: 'health', passed: false, details: safeNetworkErrorDetails() });
  }

  try {
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/ready`, { method: 'GET' }, timeoutMs);
    const body = await readJson(response);
    const ready = isObject(body) ? body.ready : undefined;

    checks.push({
      name: 'readiness',
      passed: response.ok && ready === true,
      status: response.status,
      details: `HTTP ${response.status}; ready=${ready === true}`,
    });
  } catch {
    checks.push({ name: 'readiness', passed: false, details: safeNetworkErrorDetails() });
  }

  if (!inboundVerificationPassed) {
    checks.push({
      name: 'signed_chatwoot_webhook',
      passed: false,
      details: 'Skipped because the configured Chatwoot message was not independently confirmed',
    });
  } else {
    try {
      const body = createWebhookBody(options, messageId, messageContent);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const deliveryId = `cvg-smoke-${options.accountId}-${options.conversationId}-${messageId}-${timestamp}`;
      const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/webhooks/chatwoot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatwoot-signature': signBody(body, timestamp, options.webhookSecret),
          'x-chatwoot-timestamp': timestamp,
          'x-chatwoot-delivery': deliveryId,
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
        details: `HTTP ${response.status}; accepted=${success === true}`,
      });

      if (response.ok && options.messageId !== undefined) {
        const idempotencyKey = `cvg:${options.accountId}:${options.conversationId}:${options.messageId}`;
        try {
          const externalResponse = await waitForChatwootResponse(
            options,
            fetchImpl,
            idempotencyKey,
            timeoutMs
          );
          checks.push({
            name: 'chatwoot_response_reconciled',
            passed: Boolean(externalResponse),
            details: externalResponse
              ? `Outgoing response ${externalResponse.id} carries the durable idempotency marker`
              : 'No outgoing response with the durable idempotency marker was found before timeout',
          });
        } catch {
          checks.push({
            name: 'chatwoot_response_reconciled',
            passed: false,
            details: safeNetworkErrorDetails(),
          });
        }
      }
    } catch {
      checks.push({ name: 'signed_chatwoot_webhook', passed: false, details: safeNetworkErrorDetails() });
    }
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

  const optionalRealVerification = [env.CHATWOOT_API_URL, env.CHATWOOT_API_TOKEN, env.SMOKE_CHATWOOT_MESSAGE_ID]
    .some(Boolean);
  if (optionalRealVerification && (!env.CHATWOOT_API_URL || !env.CHATWOOT_API_TOKEN || !env.SMOKE_CHATWOOT_MESSAGE_ID)) {
    throw new Error(
      'CHATWOOT_API_URL, CHATWOOT_API_TOKEN and SMOKE_CHATWOOT_MESSAGE_ID are required together for real message verification'
    );
  }

  const messageId = parseOptionalPositiveInteger(env.SMOKE_CHATWOOT_MESSAGE_ID, 'SMOKE_CHATWOOT_MESSAGE_ID');

  return {
    agentBaseUrl: env.AGENT_BASE_URL as string,
    webhookSecret: env.CHATWOOT_WEBHOOK_SECRET as string,
    conversationId: parsePositiveInteger(env.SMOKE_CHATWOOT_CONVERSATION_ID as string, 'SMOKE_CHATWOOT_CONVERSATION_ID'),
    accountId: parsePositiveInteger(env.SMOKE_CHATWOOT_ACCOUNT_ID as string, 'SMOKE_CHATWOOT_ACCOUNT_ID'),
    inboxId: parsePositiveInteger(env.SMOKE_CHATWOOT_INBOX_ID as string, 'SMOKE_CHATWOOT_INBOX_ID'),
    contactId: parsePositiveInteger(env.SMOKE_CHATWOOT_CONTACT_ID as string, 'SMOKE_CHATWOOT_CONTACT_ID'),
    contactName: env.SMOKE_CHATWOOT_CONTACT_NAME || 'Smoke Test',
    messageContent: env.SMOKE_MESSAGE_CONTENT || 'Teste automatico de readiness do agent-secretary.',
    strictHealth: env.SMOKE_STRICT_HEALTH !== 'false',
    timeoutMs: parseOptionalPositiveInteger(env.SMOKE_TIMEOUT_MS, 'SMOKE_TIMEOUT_MS'),
    ...(env.CHATWOOT_API_URL ? { chatwootApiUrl: env.CHATWOOT_API_URL } : {}),
    ...(env.CHATWOOT_API_TOKEN ? { chatwootApiToken: env.CHATWOOT_API_TOKEN } : {}),
    ...(messageId !== undefined ? { messageId } : {}),
    ...(env.SMOKE_RESPONSE_TIMEOUT_MS
      ? { responseTimeoutMs: parsePositiveInteger(env.SMOKE_RESPONSE_TIMEOUT_MS, 'SMOKE_RESPONSE_TIMEOUT_MS') }
      : {}),
    ...(env.SMOKE_RESPONSE_POLL_MS
      ? { responsePollMs: parsePositiveInteger(env.SMOKE_RESPONSE_POLL_MS, 'SMOKE_RESPONSE_POLL_MS') }
      : {}),
  };
}
