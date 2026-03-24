"use strict";
// Contact entity for Phase 2
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapRowToContact = mapRowToContact;
// Mapper from DB row to entity
function mapRowToContact(row) {
    return {
        id: row.id,
        chatwootId: row.chatwoot_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        whatsapp: row.whatsapp,
        address: row.address,
        city: row.city,
        state: row.state,
        postalCode: row.postal_code,
        cpf: row.cpf,
        preferredChannel: row.preferred_channel,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
    };
}
//# sourceMappingURL=types.js.map