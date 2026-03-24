import { ConversationContext, NormalizedMessage, ConversationState } from '../../shared/types';
/**
 * Extended context that includes memory information (for LLM context)
 */
export interface MemoryContext {
    contactId: string;
    contactName: string;
    memories: string[];
    pets: Array<{
        id: string;
        name: string;
        species: string;
        breed: string | null;
    }>;
}
/**
 * Load conversation context from Redis
 */
export declare function loadConversationContext(conversationId: string, chatwootConversationId: number, contactId: string, chatwootContactId: number, contactName: string, inboxId: number, accountId: number): Promise<ConversationContext>;
/**
 * Save conversation context to Redis
 */
export declare function saveConversationContext(context: ConversationContext): Promise<void>;
/**
 * Add message to conversation context
 */
export declare function addMessageToContext(context: ConversationContext, message: NormalizedMessage): Promise<ConversationContext>;
/**
 * Get conversation messages formatted for OpenAI
 */
export declare function formatConversationHistory(messages: NormalizedMessage[]): string[];
/**
 * Check if conversation is in a state that should be processed
 */
export declare function shouldProcessConversation(context: ConversationContext): boolean;
/**
 * Update conversation state
 */
export declare function updateConversationState(context: ConversationContext, newState: ConversationState): Promise<void>;
/**
 * Load contact and memory for context (Phase 2)
 */
export declare function loadContactAndMemories(chatwootContactId: number, contactName: string): Promise<{
    contactId: string | null;
    contact: any | null;
    memories: string[];
    pets: any[];
}>;
//# sourceMappingURL=contextLoader.d.ts.map