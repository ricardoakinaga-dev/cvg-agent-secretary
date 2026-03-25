import { query } from '../../shared/db/index.js';
import { logger } from '../logging/index.js';
import { 
  Pet, 
  CreatePetInput, 
  UpdatePetInput, 
  PetSearchInput,
  PetRow,
  mapRowToPet,
  VALID_SPECIES,
  ValidSpecies
} from './types.js';

type QueryParams = unknown[];

export class PetRepository {
  
  /**
   * Find pets by various search criteria
   */
  async find(input: PetSearchInput): Promise<Pet[]> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: QueryParams = [];
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
      const result = await query<PetRow>(sql, params);
      return result.rows.map(mapRowToPet);
    } catch (error) {
      logger.error('Error finding pets', error as Error, { input });
      throw error;
    }
  }

  /**
   * Find a pet by ID
   */
  async findById(id: string): Promise<Pet | null> {
    const sql = `
      SELECT * FROM pets 
      WHERE id = $1 AND deleted_at IS NULL
    `;

    try {
      const result = await query<PetRow>(sql, [id]);
      if (result.rows.length === 0) {
        return null;
      }
      return mapRowToPet(result.rows[0]);
    } catch (error) {
      logger.error('Error finding pet by ID', error as Error, { id });
      throw error;
    }
  }

  /**
   * Create a new pet
   */
  async create(input: CreatePetInput): Promise<Pet> {
    // Validate species
    if (!VALID_SPECIES.includes(input.species as ValidSpecies)) {
      throw new Error(`Invalid species. Must be one of: ${VALID_SPECIES.join(', ')}`);
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
      const result = await query<PetRow>(sql, params);
      logger.info('Pet created', { petId: result.rows[0].id });
      return mapRowToPet(result.rows[0]);
    } catch (error) {
      logger.error('Error creating pet', error as Error, { input });
      throw error;
    }
  }

  /**
   * Create or update a pet based on existence
   */
  async createOrUpdate(input: CreatePetInput & { id?: string }): Promise<Pet> {
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
  async update(id: string, input: UpdatePetInput): Promise<Pet> {
    const fields: string[] = [];
    const params: QueryParams = [];
    let paramIndex = 1;

    const updateField = (field: string, value: unknown) => {
      if (value !== undefined) {
        fields.push(`${field} = $${paramIndex++}`);
        params.push(value);
      }
    };

    if (input.species !== undefined && !VALID_SPECIES.includes(input.species as ValidSpecies)) {
      throw new Error(`Invalid species. Must be one of: ${VALID_SPECIES.join(', ')}`);
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
      logger.warn('PetRepository.update called with no fields to update', { id });
      return this.findById(id) as Promise<Pet>;
    }

    const sql = `
      UPDATE pets 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND deleted_at IS NULL
      RETURNING *
    `;
    params.push(id);

    try {
      const result = await query<PetRow>(sql, params);
      if (result.rows.length === 0) {
        throw new Error('Pet not found or already deleted');
      }
      logger.info('Pet updated', { petId: id });
      return mapRowToPet(result.rows[0]);
    } catch (error) {
      logger.error('Error updating pet', error as Error, { id, input });
      throw error;
    }
  }

  /**
   * Soft delete a pet
   */
  async delete(id: string): Promise<void> {
    const sql = `
      UPDATE pets 
      SET deleted_at = NOW(), is_active = false
      WHERE id = $1 AND deleted_at IS NULL
    `;

    try {
      const result = await query(sql, [id]);
      if (result.rowCount === 0) {
        logger.warn('Pet not found for deletion', { id });
      } else {
        logger.info('Pet soft deleted', { petId: id });
      }
    } catch (error) {
      logger.error('Error deleting pet', error as Error, { id });
      throw error;
    }
  }
}

// Export singleton instance
export const petRepository = new PetRepository();