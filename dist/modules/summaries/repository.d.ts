import { ConversationSummary, CreateSummaryInput } from './types.js';
export declare class SummaryRepository {
    /**
     * Find summary by conversation ID
     */
    findByConversation(conversationId: string): Promise<ConversationSummary | null>;
    /**
     * Create a new summary
     */
    create(input: CreateSummaryInput): Promise<ConversationSummary>;
    /**
     * Update existing summary
     */
    update(id: string, input: Partial<CreateSummaryInput>): Promise<ConversationSummary>;
    /**
     * List summaries for a contact (across all their conversations)
     */
    findByContact(contactId: string, limit?: number): Promise<ConversationSummary[]>;
}
export declare const summaryRepository: SummaryRepository;
//# sourceMappingURL=repository.d.ts.map