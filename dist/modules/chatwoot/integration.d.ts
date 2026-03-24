/**
 * Handoff-related labels for Chatwoot
 */
export declare const HANDOFF_LABELS: {
    readonly HANDOFF: "handoff";
    readonly URGENT: "urgent";
    readonly COMPLAINT: "complaint";
    readonly FINANCIAL: "financial";
    readonly RESOLVED: "resolved";
    readonly PENDING: "pending";
    readonly ESCALATED: "escalated";
};
/**
 * Summary for human agent
 */
export interface HandoffSummary {
    contactName: string;
    petName?: string;
    conversationHistory: string[];
    whatClientWanted: string;
    informationCollected: Record<string, string>;
    handoffReason: string;
    pendingQuestions: string[];
    whatWasAnswered: string[];
}
/**
 * Generate structured summary for human agent
 * Based on specs/08_HANDOFF_SYSTEM.md
 */
export declare function generateHandoffSummary(summary: HandoffSummary): string;
/**
 * Execute handoff in Chatwoot
 */
export declare function executeHandoff(conversationId: number, summary: HandoffSummary, labels?: string[]): Promise<void>;
/**
 * Create transfer message for client
 */
export declare function createTransferMessage(): string;
/**
 * Create waiting message during handoff
 */
export declare function createWaitingMessage(): string;
/**
 * Map intent to Chatwoot labels
 */
export declare function getLabelsForIntent(intent: string, riskLevel?: string): string[];
//# sourceMappingURL=integration.d.ts.map