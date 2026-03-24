export interface SendMessageParams {
    conversationId: number;
    content: string;
    private?: boolean;
}
declare class ChatwootClient {
    private baseUrl;
    private apiToken;
    private accountId;
    constructor();
    private request;
    /**
     * Send a message to a conversation
     */
    sendMessage(params: SendMessageParams): Promise<{
        id: number;
    }>;
    /**
     * Add a label to a conversation
     */
    addLabel(conversationId: number, label: string): Promise<void>;
    /**
     * Assign a conversation to an agent
     */
    assignConversation(conversationId: number, agentId: number): Promise<void>;
    /**
     * Update conversation status
     */
    updateStatus(conversationId: number, status: 'open' | 'pending' | 'resolved' | 'closed'): Promise<void>;
    /**
     * Health check - verify API connection
     */
    healthCheck(): Promise<boolean>;
}
export declare const chatwootClient: ChatwootClient;
export {};
//# sourceMappingURL=client.d.ts.map