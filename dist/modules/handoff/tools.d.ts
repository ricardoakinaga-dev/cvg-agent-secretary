/**
 * Input for create_handoff tool
 */
export interface CreateHandoffToolInput {
    conversationId: string;
    contactId?: string;
    triggerType: string;
    triggerReason: string;
    summary?: string;
    pendingQuestions?: string[];
    whatWasAnswered?: string;
    whatIsMissing?: string;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}
/**
 * Output from create_handoff tool
 */
export interface CreateHandoffToolOutput {
    success: boolean;
    handoffId: string;
    message: string;
}
/**
 * Tool: create_handoff
 * Creates a handoff (transfer to human)
 * Based on specs/09_AGENT_TOOLS.md section 9
 */
export declare function createHandoff(input: CreateHandoffToolInput): Promise<CreateHandoffToolOutput>;
/**
 * Input for notify_sector tool
 */
export interface NotifySectorInput {
    sector: 'recepcao' | 'clinico' | 'gerencia' | 'financeiro';
    message: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    conversationId?: string;
    contactId?: string;
}
/**
 * Output from notify_sector tool
 */
export interface NotifySectorOutput {
    success: boolean;
    notificationId: string;
    sector: string;
}
/**
 * Tool: notify_sector
 * Sends notification to a specific sector
 * Based on specs/09_AGENT_TOOLS.md section 10
 */
export declare function notifySector(input: NotifySectorInput): Promise<NotifySectorOutput>;
/**
 * Input for create_followup_task tool
 */
export interface CreateFollowupTaskInput {
    conversationId?: string;
    contactId?: string;
    taskType: 'reminder' | 'callback' | 'confirmation' | 'info';
    title: string;
    description?: string;
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high';
}
/**
 * Output from create_followup_task tool
 */
export interface CreateFollowupTaskOutput {
    success: boolean;
    taskId: string;
    title: string;
}
/**
 * Tool: create_followup_task
 * Creates a follow-up task
 * Based on specs/09_AGENT_TOOLS.md section 11
 */
export declare function createFollowupTask(input: CreateFollowupTaskInput): Promise<CreateFollowupTaskOutput>;
/**
 * Input for get_operational_rules tool
 */
export interface GetOperationalRulesInput {
    ruleType?: 'policy' | 'schedule' | 'handoff' | 'security' | 'pricing';
}
/**
 * Output from get_operational_rules tool
 */
export interface GetOperationalRulesOutput {
    success: boolean;
    rules: Array<{
        id: string;
        name: string;
        description: string | null;
        type: string;
        content: Record<string, unknown>;
    }>;
}
/**
 * Tool: get_operational_rules
 * Gets operational rules from the database
 * Based on specs/09_AGENT_TOOLS.md section 8
 */
export declare function getOperationalRules(input: GetOperationalRulesInput): Promise<GetOperationalRulesOutput>;
export declare const handoffTools: {
    create_handoff: typeof createHandoff;
    notify_sector: typeof notifySector;
    create_followup_task: typeof createFollowupTask;
    get_operational_rules: typeof getOperationalRules;
};
export type HandoffToolName = keyof typeof handoffTools;
//# sourceMappingURL=tools.d.ts.map