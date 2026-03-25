import { query } from '../../shared/db/index.js';
import { logger } from '../logging/index.js';
import { 
  Contact, 
  CreateContactInput, 
  UpdateContactInput, 
  ContactSearchInput,
  ContactRow,
  mapRowToContact 
} from './types.js';

type QueryParams = unknown[];

export class ContactRepository {
  
  /**
   * Find a contact by various search criteria
   */
  async find(input: ContactSearchInput): Promise<Contact | null> {
    const conditions: string[] = [];
    const params: QueryParams = [];
    let paramIndex = 1;

    if (input.phone) {
      conditions.push(`phone = $${paramIndex++}`);
      params.push(input.phone);
    }
    if (input.email) {
      conditions.push(`email = $${paramIndex++}`);
      params.push(input.email);
    }
    if (input.name) {
      conditions.push(`name ILIKE $${paramIndex++}`);
      params.push(`%${input.name}%`);
    }
    if (input.chatwootId) {
      conditions.push(`chatwoot_id = $${paramIndex++}`);
      params.push(input.chatwootId);
    }

    if (conditions.length === 0) {
      logger.warn('ContactRepository.find called with no search criteria');
      return null;
    }

    const sql = `
      SELECT * FROM contacts 
      WHERE ${conditions.join(' AND ')}
      AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;

    try {
      const result = await query<ContactRow>(sql, params);
      if (result.rows.length === 0) {
        return null;
      }
      return mapRowToContact(result.rows[0]);
    } catch (error) {
      logger.error('Error finding contact', error as Error, { input });
      throw error;
    }
  }

  /**
   * Find a contact by ID
   */
  async findById(id: string): Promise<Contact | null> {
    const sql = `
      SELECT * FROM contacts 
      WHERE id = $1 AND deleted_at IS NULL
    `;

    try {
      const result = await query<ContactRow>(sql, [id]);
      if (result.rows.length === 0) {
        return null;
      }
      return mapRowToContact(result.rows[0]);
    } catch (error) {
      logger.error('Error finding contact by ID', error as Error, { id });
      throw error;
    }
  }

  /**
   * Create a new contact
   */
  async create(input: CreateContactInput): Promise<Contact> {
    const sql = `
      INSERT INTO contacts (
        chatwoot_id, name, email, phone, whatsapp, address, city, state,
        postal_code, cpf, preferred_channel, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const params = [
      input.chatwootId || null,
      input.name,
      input.email || null,
      input.phone || null,
      input.whatsapp || null,
      input.address || null,
      input.city || null,
      input.state || null,
      input.postalCode || null,
      input.cpf || null,
      input.preferredChannel || 'chatwoot',
      input.notes || null,
    ];

    try {
      const result = await query<ContactRow>(sql, params);
      logger.info('Contact created', { contactId: result.rows[0].id });
      return mapRowToContact(result.rows[0]);
    } catch (error) {
      logger.error('Error creating contact', error as Error, { input });
      throw error;
    }
  }

  /**
   * Create or update a contact based on existence
   */
  async createOrUpdate(input: CreateContactInput & { id?: string }): Promise<Contact> {
    // If ID provided, try to update
    if (input.id) {
      const existing = await this.findById(input.id);
      if (existing) {
        return this.update(input.id, input);
      }
    }

    // Try to find by chatwoot_id or phone
    if (input.chatwootId) {
      const existing = await this.find({ chatwootId: input.chatwootId });
      if (existing) {
        return this.update(existing.id, input);
      }
    }
    if (input.phone) {
      const existing = await this.find({ phone: input.phone });
      if (existing) {
        return this.update(existing.id, input);
      }
    }

    // Create new contact
    return this.create(input);
  }

  /**
   * Update an existing contact
   */
  async update(id: string, input: UpdateContactInput): Promise<Contact> {
    const fields: string[] = [];
    const params: QueryParams = [];
    let paramIndex = 1;

    const updateField = (field: string, value: unknown) => {
      if (value !== undefined) {
        fields.push(`${field} = $${paramIndex++}`);
        params.push(value);
      }
    };

    updateField('name', input.name);
    updateField('email', input.email);
    updateField('phone', input.phone);
    updateField('whatsapp', input.whatsapp);
    updateField('address', input.address);
    updateField('city', input.city);
    updateField('state', input.state);
    updateField('postal_code', input.postalCode);
    updateField('cpf', input.cpf);
    updateField('preferred_channel', input.preferredChannel);
    updateField('notes', input.notes);
    updateField('deleted_at', input.deletedAt);

    if (fields.length === 0) {
      logger.warn('ContactRepository.update called with no fields to update', { id });
      return this.findById(id) as Promise<Contact>;
    }

    const sql = `
      UPDATE contacts 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND deleted_at IS NULL
      RETURNING *
    `;
    params.push(id);

    try {
      const result = await query<ContactRow>(sql, params);
      if (result.rows.length === 0) {
        throw new Error('Contact not found or already deleted');
      }
      logger.info('Contact updated', { contactId: id });
      return mapRowToContact(result.rows[0]);
    } catch (error) {
      logger.error('Error updating contact', error as Error, { id, input });
      throw error;
    }
  }

  /**
   * Soft delete a contact
   */
  async delete(id: string): Promise<void> {
    const sql = `
      UPDATE contacts 
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `;

    try {
      const result = await query(sql, [id]);
      if (result.rowCount === 0) {
        logger.warn('Contact not found for deletion', { id });
      } else {
        logger.info('Contact soft deleted', { contactId: id });
      }
    } catch (error) {
      logger.error('Error deleting contact', error as Error, { id });
      throw error;
    }
  }
}

// Export singleton instance
export const contactRepository = new ContactRepository();