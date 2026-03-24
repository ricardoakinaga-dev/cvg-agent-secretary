"use strict";
// Conversation Summary entity for Phase 2
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapRowToSummary = mapRowToSummary;
// Mapper from DB row to entity
function mapRowToSummary(row) {
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
//# sourceMappingURL=types.js.map