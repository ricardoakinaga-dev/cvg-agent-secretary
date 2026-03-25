// Conversation Summary entity for Phase 2

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

// DB row type (snake_case from PostgreSQL)
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

// Mapper from DB row to entity
export function mapRowToSummary(row: SummaryRow): ConversationSummary {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    summaryText: row.summary_text,
    keyPoints: Array.isArray(row.key_points) ? row.key_points : [],
    extractedFacts: Array.isArray(row.extracted_facts) ? row.extracted_facts : [],
    intent: row.intent,
    sentiment: row.sentiment,
    needsHandoff: row.needs_handoff,
    handoffReason: row.handoff_reason,
    generatedBy: row.generated_by,
    modelVersion: row.model_version,
    createdAt: row.created_at,
  };
}