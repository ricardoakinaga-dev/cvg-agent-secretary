import { ChatwootWebhookPayload } from '../../shared/types';
export declare function looksLikeHumanOperatorMessage(content: string): boolean;
/**
 * Process a Chatwoot webhook event
 */
export declare function processWebhookEvent(payload: ChatwootWebhookPayload): Promise<void>;
/**
 * Process a conversation created event
 */
export declare function processConversationCreated(payload: ChatwootWebhookPayload): Promise<void>;
//# sourceMappingURL=agentRuntime.d.ts.map