export interface ConversationSummary {
    id: string;
    conversationId: string;
    summaryText: string;
    keyPoints: string[];
    extractedFacts: Record<string, unknown>[];
    intent: string | null;
    sentiment: string | null;
    needsHandoff: boolean;
    handoffReason: string | null;
    generatedBy: string;
    modelVersion: string | null;
    createdAt: Date;
}
export interface CreateSummaryInput {
    conversationId: string;
    summaryText: string;
    keyPoints?: string[];
    extractedFacts?: Record<string, unknown>[];
    intent?: string;
    sentiment?: string;
    needsHandoff?: boolean;
    handoffReason?: string;
    generatedBy?: string;
    modelVersion?: string;
}
export interface SummaryRow {
    id: string;
    conversation_id: string;
    summary_text: string;
    key_points: string[];
    extracted_facts: Record<string, unknown>[];
    intent: string | null;
    sentiment: string | null;
    needs_handoff: boolean;
    handoff_reason: string | null;
    generated_by: string;
    model_version: string | null;
    created_at: Date;
}
export declare function mapRowToSummary(row: SummaryRow): ConversationSummary;
//# sourceMappingURL=types.d.ts.map