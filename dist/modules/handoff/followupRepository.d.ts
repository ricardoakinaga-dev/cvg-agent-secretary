/**
 * Followup Task types
 */
export interface FollowupTask {
    id: string;
    conversationId: string | null;
    contactId: string | null;
    taskType: 'reminder' | 'callback' | 'confirmation' | 'info';
    title: string;
    description: string | null;
    dueDate: Date | null;
    priority: 'low' | 'medium' | 'high';
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    assignedTo: string | null;
    completedAt: Date | null;
    completedBy: string | null;
    createdAt: Date;
}
export interface CreateFollowupInput {
    conversationId?: string;
    contactId?: string;
    taskType: 'reminder' | 'callback' | 'confirmation' | 'info';
    title: string;
    description?: string;
    dueDate?: Date;
    priority?: 'low' | 'medium' | 'high';
}
/**
 * Followup Repository
 */
export declare class FollowupRepository {
    /**
     * Create a new followup task
     */
    create(input: CreateFollowupInput): Promise<FollowupTask>;
    /**
     * Find followups by conversation
     */
    findByConversation(conversationId: string): Promise<FollowupTask[]>;
    /**
     * Find pending followups
     */
    findPending(limit?: number): Promise<FollowupTask[]>;
    /**
     * Update followup status
     */
    updateStatus(id: string, status: FollowupTask['status'], completedBy?: string): Promise<FollowupTask>;
}
export declare const followupRepository: FollowupRepository;
//# sourceMappingURL=followupRepository.d.ts.map