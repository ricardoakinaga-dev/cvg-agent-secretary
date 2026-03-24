"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.petRepository = exports.PetRepository = void 0;
const index_js_1 = require("../../shared/db/index.js");
const index_js_2 = require("../logging/index.js");
const types_js_1 = require("./types.js");
class PetRepository {
    /**
     * Find pets by various search criteria
     */
    async find(input) {
        const conditions = ['deleted_at IS NULL'];
        const params = [];
        let paramIndex = 1;
        if (input.name) {
            conditions.push(`name ILIKE $${paramIndex++}`);
            params.push(`%${input.name}%`);
        }
        if (input.contactId) {
            conditions.push(`contact_id = $${paramIndex++}`);
            params.push(input.contactId);
        }
        if (input.petId) {
            conditions.push(`id = $${paramIndex++}`);
            params.push(input.petId);
        }
        if (input.species) {
            conditions.push(`species = $${paramIndex++}`);
            params.push(input.species);
        }
        // Always filter for active pets unless searching specifically
        if (!input.petId) {
            conditions.push('is_active = true');
        }
        const sql = `
      SELECT * FROM pets 
      WHERE ${conditions.join(' AND ')}
      ORDER BY name ASC
    `;
        try {
            const result = await (0, index_js_1.query)(sql, params);
            return result.rows.map(types_js_1.mapRowToPet);
        }
        catch (error) {
            index_js_2.logger.error('Error finding pets', error, { input });
            throw error;
        }
    }
    /**
     * Find a pet by ID
     */
    async findById(id) {
        const sql = `
      SELECT * FROM pets 
      WHERE id = $1 AND deleted_at IS NULL
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [id]);
            if (result.rows.length === 0) {
                return null;
            }
            return (0, types_js_1.mapRowToPet)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error finding pet by ID', error, { id });
            throw error;
        }
    }
    /**
     * Create a new pet
     */
    async create(input) {
        // Validate species
        if (!types_js_1.VALID_SPECIES.includes(input.species)) {
            throw new Error(`Invalid species. Must be one of: ${types_js_1.VALID_SPECIES.join(', ')}`);
        }
        const sql = `
      INSERT INTO pets (
        chatwoot_id, contact_id, name, species, breed, birth_date, 
        age_years, age_months, gender, weight, color, microchip,
        vaccination_status, medical_conditions, behavior_notes, photo_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;
        const params = [
            input.chatwootId || null,
            input.contactId,
            input.name,
            input.species,
            input.breed || null,
            input.birthDate || null,
            input.ageYears || null,
            input.ageMonths || null,
            input.gender || null,
            input.weight || null,
            input.color || null,
            input.microchip || null,
            input.vaccinationStatus || null,
            input.medicalConditions || null,
            input.behaviorNotes || null,
            input.photoUrl || null,
        ];
        try {
            const result = await (0, index_js_1.query)(sql, params);
            index_js_2.logger.info('Pet created', { petId: result.rows[0].id });
            return (0, types_js_1.mapRowToPet)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error creating pet', error, { input });
            throw error;
        }
    }
    /**
     * Create or update a pet based on existence
     */
    async createOrUpdate(input) {
        // If ID provided, try to update
        if (input.id) {
            const existing = await this.findById(input.id);
            if (existing) {
                return this.update(input.id, input);
            }
        }
        // Try to find by name and contact
        if (input.name && input.contactId) {
            const existingPets = await this.find({
                name: input.name,
                contactId: input.contactId
            });
            if (existingPets.length > 0) {
                return this.update(existingPets[0].id, input);
            }
        }
        // Create new pet
        return this.create(input);
    }
    /**
     * Update an existing pet
     */
    async update(id, input) {
        const fields = [];
        const params = [];
        let paramIndex = 1;
        const updateField = (field, value) => {
            if (value !== undefined) {
                fields.push(`${field} = $${paramIndex++}`);
                params.push(value);
            }
        };
        if (input.species !== undefined && !types_js_1.VALID_SPECIES.includes(input.species)) {
            throw new Error(`Invalid species. Must be one of: ${types_js_1.VALID_SPECIES.join(', ')}`);
        }
        updateField('name', input.name);
        updateField('species', input.species);
        updateField('breed', input.breed);
        updateField('birth_date', input.birthDate);
        updateField('age_years', input.ageYears);
        updateField('age_months', input.ageMonths);
        updateField('gender', input.gender);
        updateField('weight', input.weight);
        updateField('color', input.color);
        updateField('microchip', input.microchip);
        updateField('vaccination_status', input.vaccinationStatus);
        updateField('medical_conditions', input.medicalConditions);
        updateField('behavior_notes', input.behaviorNotes);
        updateField('photo_url', input.photoUrl);
        updateField('is_active', input.isActive);
        updateField('deleted_at', input.deletedAt);
        if (fields.length === 0) {
            index_js_2.logger.warn('PetRepository.update called with no fields to update', { id });
            return this.findById(id);
        }
        const sql = `
      UPDATE pets 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND deleted_at IS NULL
      RETURNING *
    `;
        params.push(id);
        try {
            const result = await (0, index_js_1.query)(sql, params);
            if (result.rows.length === 0) {
                throw new Error('Pet not found or already deleted');
            }
            index_js_2.logger.info('Pet updated', { petId: id });
            return (0, types_js_1.mapRowToPet)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error updating pet', error, { id, input });
            throw error;
        }
    }
    /**
     * Soft delete a pet
     */
    async delete(id) {
        const sql = `
      UPDATE pets 
      SET deleted_at = NOW(), is_active = false
      WHERE id = $1 AND deleted_at IS NULL
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [id]);
            if (result.rowCount === 0) {
                index_js_2.logger.warn('Pet not found for deletion', { id });
            }
            else {
                index_js_2.logger.info('Pet soft deleted', { petId: id });
            }
        }
        catch (error) {
            index_js_2.logger.error('Error deleting pet', error, { id });
            throw error;
        }
    }
}
exports.PetRepository = PetRepository;
// Export singleton instance
exports.petRepository = new PetRepository();
//# sourceMappingURL=repository.js.map