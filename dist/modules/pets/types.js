"use strict";
// Pet entity for Phase 2
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_SPECIES = void 0;
exports.mapRowToPet = mapRowToPet;
// Valid species values
exports.VALID_SPECIES = ['cachorro', 'gato', 'pássaro', 'roedor', 'outro'];
// Mapper from DB row to entity
function mapRowToPet(row) {
    return {
        id: row.id,
        chatwootId: row.chatwoot_id,
        contactId: row.contact_id,
        name: row.name,
        species: row.species,
        breed: row.breed,
        birthDate: row.birth_date,
        ageYears: row.age_years,
        ageMonths: row.age_months,
        gender: row.gender,
        weight: row.weight ? parseFloat(row.weight.toString()) : null,
        color: row.color,
        microchip: row.microchip,
        vaccinationStatus: row.vaccination_status,
        medicalConditions: row.medical_conditions,
        behaviorNotes: row.behavior_notes,
        photoUrl: row.photo_url,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
    };
}
//# sourceMappingURL=types.js.map