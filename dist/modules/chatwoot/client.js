"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatwootClient = void 0;
const config_1 = require("../../config");
const logging_1 = require("../logging");
class ChatwootClient {
    baseUrl;
    apiToken;
    accountId;
    constructor() {
        this.baseUrl = config_1.config.chatwoot.apiUrl;
        this.apiToken = config_1.config.chatwoot.apiToken;
        this.accountId = config_1.config.chatwoot.accountId;
    }
    async request(method, endpoint, body) {
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
            throw new Error(`Chatwoot API error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return response.json();
    }
    /**
     * Send a message to a conversation
     */
    async sendMessage(params) {
        const { conversationId, content, private: isPrivate = false } = params;
        logging_1.logger.info('Sending message to Chatwoot', {
            conversationId,
            contentLength: content.length,
            isPrivate,
        });
        try {
            const result = await this.request('POST', `/conversations/${conversationId}/messages`, {
                content,
                private: isPrivate,
            });
            logging_1.logger.info('Message sent successfully', {
                messageId: result.id,
                conversationId,
            });
            return result;
        }
        catch (error) {
            logging_1.logger.error('Failed to send message to Chatwoot', error, {
                conversationId,
            });
            throw error;
        }
    }
    /**
     * Add a label to a conversation
     */
    async addLabel(conversationId, label) {
        await this.request('POST', `/conversations/${conversationId}/labels`, { labels: [label] });
        logging_1.logger.info('Label added to conversation', {
            conversationId,
            label,
        });
    }
    /**
     * Assign a conversation to an agent
     */
    async assignConversation(conversationId, agentId) {
        await this.request('PATCH', `/conversations/${conversationId}`, {
            conversation: {
                assignee_id: agentId,
            },
        });
        logging_1.logger.info('Conversation assigned', {
            conversationId,
            agentId,
        });
    }
    /**
     * Update conversation status
     */
    async updateStatus(conversationId, status) {
        await this.request('PATCH', `/conversations/${conversationId}`, {
            conversation: {
                status,
            },
        });
        logging_1.logger.info('Conversation status updated', {
            conversationId,
            status,
        });
    }
    /**
     * Health check - verify API connection
     */
    async healthCheck() {
        try {
            await this.request('GET', '/me');
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.chatwootClient = new ChatwootClient();
//# sourceMappingURL=client.js.map