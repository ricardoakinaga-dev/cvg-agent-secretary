/**
 * Handoff record types
 */
export interface HandoffRecord {
    id: string;
    conversationId: string;
    contactId: string | null;
    triggerType: string;
    triggerReason: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'critical';
    summary: string | null;
    pendingQuestions: string[];
    whatWasAnswered: string | null;
    whatIsMissing: string | null;
    riskLevel: 'low' | 'medium' | 'high';
    createdAt: Date;
    completedAt: Date | null;
    resolvedBy: string | null;
    resolutionNotes: string | null;
}
export interface CreateHandoffInput {
    conversationId: string;
    contactId?: string;
    triggerType: string;
    triggerReason: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    summary?: string;
    pendingQuestions?: string[];
    whatWasAnswered?: string;
    whatIsMissing?: string;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}
export interface HandoffRow {
    id: string;
    conversation_id: string;
    contact_id: string | null;
    trigger_type: string;
    trigger_reason: string;
    status: string;
    priority: string;
    summary: string | null;
    pending_questions: string[];
    what_was_answered: string | null;
    what_is_missing: string | null;
    risk_level: string;
    created_at: Date;
    completed_at: Date | null;
    resolved_by: string | null;
    resolution_notes: string | null;
}
/**
 * Operational Rules types
 */
export interface OperationalRule {
    id: string;
    ruleType: string;
    name: string;
    description: string | null;
    content: Record<string, unknown>;
    isActive: boolean;
    priority: number;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdBy: string | null;
    createdAt: Date;
}
export interface OperationalRuleRow {
    id: string;
    rule_type: string;
    name: string;
    description: string | null;
    content: Record<string, unknown>;
    is_active: boolean;
    priority: number;
    effective_from: Date;
    effective_to: Date | null;
    created_by: string | null;
    created_at: Date;
}
/**
 * Sector Notification types
 */
export interface SectorNotification {
    id: string;
    sector: string;
    conversationId: string | null;
    contactId: string | null;
    message: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    status: 'pending' | 'sent' | 'read' | 'failed';
    sentAt: Date | null;
    readAt: Date | null;
    createdAt: Date;
}
export interface CreateNotificationInput {
    sector: string;
    conversationId?: string;
    contactId?: string;
    message: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
}
export interface NotificationRow {
    id: string;
    sector: string;
    conversation_id: string | null;
    contact_id: string | null;
    message: string;
    priority: string;
    status: string;
    sent_at: Date | null;
    read_at: Date | null;
    created_at: Date;
}
/**
 * Handoff Repository
 */
export declare class HandoffRepository {
    /**
     * Create a new handoff record
     */
    create(input: CreateHandoffInput): Promise<HandoffRecord>;
    /**
     * Find handoff by conversation ID
     */
    findByConversation(conversationId: string): Promise<HandoffRecord | null>;
    /**
     * Update handoff status
     */
    updateStatus(id: string, status: HandoffRecord['status'], resolvedBy?: string, resolutionNotes?: string): Promise<HandoffRecord>;
    /**
     * Get operational rules by type
     */
    getOperationalRules(ruleType?: string): Promise<OperationalRule[]>;
    /**
     * Create sector notification
     */
    createNotification(input: CreateNotificationInput): Promise<SectorNotification>;
    /**
     * Update notification status
     */
    updateNotificationStatus(id: string, status: SectorNotification['status']): Promise<void>;
}
export declare const handoffRepository: HandoffRepository;
//# sourceMappingURL=repository.d.ts.map