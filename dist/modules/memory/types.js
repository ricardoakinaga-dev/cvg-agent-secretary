"use strict";
// Customer Memory entity for Phase 2
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_SOURCES = exports.VALID_CATEGORIES = exports.CONFIDENCE_THRESHOLDS = void 0;
exports.mapRowToMemory = mapRowToMemory;
// Confidence thresholds as per spec
exports.CONFIDENCE_THRESHOLDS = {
    AUTO_SAVE: 0.9, // >= 0.9: save automatically
    IMPLICIT_CONFIRM: 0.7, // 0.7-0.89: save after 1 implicit confirmation
    EXPLICIT_CONFIRM: 0.7, // < 0.7: require explicit confirmation
};
// Valid categories
exports.VALID_CATEGORIES = [
    'contact_info',
    'pet_info',
    'preference',
    'history',
    'need'
];
// Valid sources
exports.VALID_SOURCES = [
    'extraction',
    'user_confirmed',
    'system',
    'update'
];
// Mapper from DB row to entity
function mapRowToMemory(row) {
    return {
        id: row.id,
        contactId: row.contact_id,
        petId: row.pet_id,
        conversationId: row.conversation_id,
        category: row.category,
        key: row.key,
        value: typeof row.value === 'string' ? JSON.parse(row.value) : row.value,
        confidence: parseFloat(row.confidence.toString()),
        source: row.source,
        isActive: row.is_active,
        lastConfirmedAt: row.last_confirmed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
//# sourceMappingURL=types.js.map