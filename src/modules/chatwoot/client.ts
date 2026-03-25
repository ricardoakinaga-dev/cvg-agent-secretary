import { config } from '../../config';
import { logger } from '../logging';

export interface SendMessageParams {
  conversationId: number;
  content: string;
  private?: boolean;
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
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': this.apiToken,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Chatwoot API error: ${response.status} ${response.statusText} - ${errorText}`
      );
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
      await this.request<{ account: { id: number } }>('GET', '/me');
      return true;
    } catch {
      return false;
    }
  }
}

export const chatwootClient = new ChatwootClient();
