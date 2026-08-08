import { config } from '../../config';
import { logger } from '../logging';

export interface SendMessageParams {
  conversationId: number;
  content: string;
  private?: boolean;
}

export interface IdempotentSendMessageParams extends SendMessageParams {
  idempotencyKey: string;
}

export interface ChatwootMessageLookup {
  id: number;
  content?: string;
  message_type?: 'incoming' | 'outgoing' | 0 | 1;
  private?: boolean;
  sender?: { type?: string };
  content_attributes?: Record<string, unknown>;
  created_at?: number | string;
}

export interface IdempotencyLookupOptions {
  /** Require a private internal note when reconciling a handoff note. */
  private?: boolean;
}

export class ChatwootApiError extends Error {
  constructor(
    public readonly status: number,
    statusText: string
  ) {
    super(`Chatwoot API error: ${status} ${statusText}`);
    this.name = 'ChatwootApiError';
  }
}

interface LabelsResponse {
  payload?: string[];
  labels?: string[];
}

class ChatwootClient {
  private baseUrl: string;
  private apiToken: string;
  private accountId: string;

  constructor() {
    this.baseUrl = config.chatwoot.apiUrl;
    this.apiToken = config.chatwoot.apiToken;
    this.accountId = config.chatwoot.accountId;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1/accounts/${this.accountId}${endpoint}`;
    
    const response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': this.apiToken,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      await response.text().catch(() => undefined);
      throw new ChatwootApiError(response.status, response.statusText);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Send a message to a conversation
   */
  async sendMessage(params: SendMessageParams): Promise<{ id: number }> {
    const { conversationId, content, private: isPrivate = false } = params;

    logger.info('Sending message to Chatwoot', {
      conversationId: String(conversationId),
      contentLength: content.length,
      isPrivate,
    });

    try {
      const result = await this.request<{ id: number }>(
        'POST',
        `/conversations/${conversationId}/messages`,
        {
          content,
          private: isPrivate,
        }
      );

      logger.info('Message sent successfully', {
        messageId: String(result.id),
        conversationId: String(conversationId),
      });

      return result;
    } catch (error) {
      logger.error('Failed to send message to Chatwoot', error as Error, {
        conversationId: String(conversationId),
      });
      throw error;
    }
  }

  /**
   * Send a response carrying a stable local idempotency marker. Chatwoot does
   * not provide a native idempotency-key contract for this endpoint, so the
   * marker is also used by reconciliation after an unknown network result.
   */
  async sendMessageWithIdempotency(
    params: IdempotentSendMessageParams
  ): Promise<{ id: number }> {
    const { conversationId, content, private: isPrivate = false, idempotencyKey } = params;
    if (!/^[a-zA-Z0-9:_-]{1,200}$/.test(idempotencyKey)) {
      throw new Error('Invalid Chatwoot response idempotency key');
    }

    logger.info('Sending idempotent message to Chatwoot', {
      conversationId: String(conversationId),
      contentLength: content.length,
      isPrivate,
    });

    return this.request<{ id: number }>(
      'POST',
      `/conversations/${conversationId}/messages`,
      {
        content,
        private: isPrivate,
        content_attributes: {
          cvg_idempotency_key: idempotencyKey,
        },
      }
    );
  }

  /**
   * Reconcile an external response after a timeout or process interruption.
   * The metadata marker is authoritative; content matching is a conservative
   * fallback for Chatwoot versions that do not return content attributes.
   */
  async findMessageByIdempotencyKey(
    conversationId: number,
    idempotencyKey: string,
    content: string,
    createdAfter: Date,
    options: IdempotencyLookupOptions = {}
  ): Promise<ChatwootMessageLookup | null> {
    const result = await this.request<ChatwootMessageLookup[] | { payload?: ChatwootMessageLookup[] }>(
      'GET',
      `/conversations/${conversationId}/messages`
    );
    const messages = Array.isArray(result) ? result : (result.payload || []);
    const createdAfterMs = createdAfter.getTime();
    const expectedPrivate = options.private === true;

    for (const message of messages) {
      const outgoing = message.message_type === 'outgoing' || message.message_type === 1;
      const visibilityMatches = expectedPrivate
        ? message.private === true
        : message.private !== true;
      if (!outgoing || !visibilityMatches) continue;

      const marker = message.content_attributes?.cvg_idempotency_key;
      if (marker === idempotencyKey) return message;

      // Content equality is not an identity guarantee: a client can receive
      // the same answer twice for different inbound messages. Production must
      // therefore reconcile only the durable marker written with the intent.
      if (!config.chatwoot.allowContentReconciliationFallback) continue;

      const createdAt = typeof message.created_at === 'number'
        ? message.created_at * 1_000
        : typeof message.created_at === 'string' ? Date.parse(message.created_at) : Number.NaN;
      if (
        message.content === content
        && (!Number.isFinite(createdAt) || createdAt >= createdAfterMs)
      ) {
        return message;
      }
    }

    return null;
  }

  async findMessageById(
    conversationId: number,
    messageId: number
  ): Promise<ChatwootMessageLookup | null> {
    const result = await this.request<ChatwootMessageLookup[] | { payload?: ChatwootMessageLookup[] }>(
      'GET',
      `/conversations/${conversationId}/messages`
    );
    const messages = Array.isArray(result) ? result : (result.payload || []);
    return messages.find((message) => message.id === messageId) || null;
  }

  /**
   * Add a label to a conversation
   */
  async addLabel(conversationId: number, label: string): Promise<void> {
    await this.request(
      'POST',
      `/conversations/${conversationId}/labels`,
      { labels: [label] }
    );

    logger.info('Label added to conversation', {
      conversationId: String(conversationId),
      label,
    });
  }

  /**
   * Adds a label by reading and replacing the complete set. Repeating this
   * operation therefore converges to one logical label even after a timeout.
   */
  async ensureLabel(conversationId: number, label: string): Promise<void> {
    const labels = await this.listLabels(conversationId);
    if (labels.includes(label)) return;
    await this.updateLabels(conversationId, [...labels, label]);
  }

  async listLabels(conversationId: number): Promise<string[]> {
    const result = await this.request<LabelsResponse | string[]>(
      'GET',
      `/conversations/${conversationId}/labels`
    );

    if (Array.isArray(result)) {
      return result;
    }

    if (Array.isArray(result.payload)) {
      return result.payload;
    }

    return result.labels || [];
  }

  async updateLabels(conversationId: number, labels: string[]): Promise<void> {
    await this.request(
      'POST',
      `/conversations/${conversationId}/labels`,
      { labels: Array.from(new Set(labels)) }
    );

    logger.info('Conversation labels updated', {
      conversationId: String(conversationId),
      labels,
    });
  }

  async removeLabels(conversationId: number, labelsToRemove: string[]): Promise<void> {
    const labelsToRemoveSet = new Set(labelsToRemove);
    const currentLabels = await this.listLabels(conversationId);
    const nextLabels = currentLabels.filter((label) => !labelsToRemoveSet.has(label));

    if (nextLabels.length === currentLabels.length) {
      logger.info('No conversation labels to remove', {
        conversationId: String(conversationId),
        labelsToRemove,
      });
      return;
    }

    await this.updateLabels(conversationId, nextLabels);
  }

  /**
   * Assign a conversation to an agent
   */
  async assignConversation(conversationId: number, agentId: number): Promise<void> {
    await this.request(
      'PATCH',
      `/conversations/${conversationId}`,
      {
        conversation: {
          assignee_id: agentId,
        },
      }
    );

    logger.info('Conversation assigned', {
      conversationId: String(conversationId),
      agentId: String(agentId),
    });
  }

  /**
   * Update conversation status
   */
  async updateStatus(
    conversationId: number,
    status: 'open' | 'pending' | 'resolved' | 'closed'
  ): Promise<void> {
    await this.request(
      'PATCH',
      `/conversations/${conversationId}`,
      {
        conversation: {
          status,
        },
      }
    );

    logger.info('Conversation status updated', {
      conversationId: String(conversationId),
      status,
    });
  }

  /**
   * Health check - verify API connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request<Array<{ id: number }>>('GET', '/agents');
      return true;
    } catch {
      return false;
    }
  }
}

export const chatwootClient = new ChatwootClient();
