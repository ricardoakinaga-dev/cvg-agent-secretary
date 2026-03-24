import { ChatwootWebhookPayload, NormalizedMessage } from '../../shared/types';
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