import { ChatwootWebhookPayload, ChatwootMessage, NormalizedMessage, ChatwootMessageType } from '../../shared/types';
export declare function normalizeChatwootMessageType(messageType: ChatwootMessageType | undefined): 'incoming' | 'outgoing' | null;
export declare function isContactMessage(message: ChatwootMessage): boolean;
export declare function isOutgoingMessage(message: ChatwootMessage | null): message is ChatwootMessage;
export declare function getWebhookMessage(payload: ChatwootWebhookPayload): ChatwootMessage | null;
/**
 * Normalizes a Chatwoot webhook payload into internal format
 */
export declare function normalizeMessage(payload: ChatwootWebhookPayload): NormalizedMessage | null;
/**
 * Validates if a webhook event should be processed
 */
export declare function isRelevantEvent(payload: ChatwootWebhookPayload): boolean;
/**
 * Extracts conversation metadata from webhook payload
 */
export declare function extractConversationMetadata(payload: ChatwootWebhookPayload): {
    conversationId: string;
    chatwootConversationId: number;
    contactId: string;
    chatwootContactId: number;
    contactName: string;
    inboxId: number;
    accountId: number;
    status: string;
};
//# sourceMappingURL=normalizer.d.ts.map