import { query } from '../../shared/db/index.js';
import { config } from '../../config/index.js';
import { logger } from '../logging/index.js';
import { randomUUID } from 'node:crypto';
import { 
  Contact, 
  CreateContactInput, 
  UpdateContactInput, 
  ContactSearchInput,
  ContactRow,
} from './types.js';
import {
  contactBlindIndex,
  isContactPiiEncryptionEnabled,
  mapStoredContact,
  protectContactPii,
} from './pii.js';

type QueryParams = unknown[];

export class ContactRepository {
  
  /**
   * Find a contact by various search criteria
   */
  async find(input: ContactSearchInput): Promise<Contact | null> {
    const conditions: string[] = [];
    const params: QueryParams = [config.chatwoot.accountId];
    let paramIndex = 2;
    let hasSearchCriterion = false;

    conditions.push('tenant_id = $1');

    if (input.phone) {
      conditions.push(`${isContactPiiEncryptionEnabled() ? 'phone_lookup' : 'phone'} = $${paramIndex++}`);
      params.push(isContactPiiEncryptionEnabled() ? contactBlindIndex('phone', input.phone) : input.phone);
      hasSearchCriterion = true;
    }
    if (input.email) {
      conditions.push(`${isContactPiiEncryptionEnabled() ? 'email_lookup' : 'email'} = $${paramIndex++}`);
      params.push(isContactPiiEncryptionEnabled() ? contactBlindIndex('email', input.email) : input.email);
      hasSearchCriterion = true;
    }
    if (input.name) {
      conditions.push(`${isContactPiiEncryptionEnabled() ? 'name_lookup =' : 'name ILIKE'} $${paramIndex++}`);
      params.push(isContactPiiEncryptionEnabled()
        ? contactBlindIndex('name', input.name)
        : `%${input.name}%`);
      hasSearchCriterion = true;
    }
    if (input.chatwootId) {
      conditions.push(`chatwoot_id = $${paramIndex++}`);
      params.push(input.chatwootId);
      hasSearchCriterion = true;
    }

    if (!hasSearchCriterion) {
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
      return mapStoredContact(result.rows[0]);
    } catch (error) {
      logger.error('Error finding contact', error as Error, {
        criteria: Object.keys(input),
      });
      throw error;
    }
  }

  /**
   * Find a contact by ID
   */
  async findById(id: string): Promise<Contact | null> {
    const sql = `
      SELECT * FROM contacts 
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
    `;

    try {
      const result = await query<ContactRow>(sql, [config.chatwoot.accountId, id]);
      if (result.rows.length === 0) {
        return null;
      }
      return mapStoredContact(result.rows[0]);
    } catch (error) {
      logger.error('Error finding contact by ID', error as Error, { id });
      throw error;
    }
  }

  /**
   * Create a new contact
   */
  async create(input: CreateContactInput): Promise<Contact> {
    if (isContactPiiEncryptionEnabled()) {
      return this.createProtected(input);
    }
    const sql = `
      INSERT INTO contacts (
        tenant_id, chatwoot_id, name, email, phone, whatsapp, address, city, state,
        postal_code, cpf, preferred_channel, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const params = [
      config.chatwoot.accountId,
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
      return mapStoredContact(result.rows[0]);
    } catch (error) {
      logger.error('Error creating contact', error as Error);
      throw error;
    }
  }

  private async createProtected(input: CreateContactInput): Promise<Contact> {
    const tenantId = config.chatwoot.accountId;
    const contactId = randomUUID();
    const protectedPii = protectContactPii(tenantId, contactId, input);
    const sql = `
      INSERT INTO contacts (
        id, tenant_id, chatwoot_id, name, preferred_channel, pii_encrypted,
        name_lookup, email_lookup, phone_lookup, whatsapp_lookup, cpf_lookup
      ) VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const params = [
      contactId,
      tenantId,
      input.chatwootId || null,
      protectedPii.placeholderName,
      input.preferredChannel || 'chatwoot',
      JSON.stringify(protectedPii.encrypted),
      protectedPii.lookups.name,
      protectedPii.lookups.email,
      protectedPii.lookups.phone,
      protectedPii.lookups.whatsapp,
      protectedPii.lookups.cpf,
    ];

    try {
      const result = await query<ContactRow>(sql, params);
      logger.info('Protected contact created', { contactId });
      return mapStoredContact(result.rows[0]);
    } catch (error) {
      logger.error('Error creating protected contact', error as Error);
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
    const params: QueryParams = [config.chatwoot.accountId];
    let paramIndex = 2;

    const updateField = (field: string, value: unknown) => {
      if (value !== undefined) {
        fields.push(`${field} = $${paramIndex++}`);
        params.push(value);
      }
    };

    if (isContactPiiEncryptionEnabled()) {
      const protectedPii = protectContactPii(config.chatwoot.accountId, id, input);
      if (Object.keys(protectedPii.encrypted).length > 0) {
        fields.push(`pii_encrypted = jsonb_strip_nulls(COALESCE(pii_encrypted, '{}'::JSONB) || $${paramIndex++}::JSONB)`);
        params.push(JSON.stringify(protectedPii.encrypted));
      }
      const protectedFields: Array<[
        keyof UpdateContactInput,
        string,
        string | null | undefined,
      ]> = [
        ['name', 'name_lookup', protectedPii.lookups.name],
        ['email', 'email_lookup', protectedPii.lookups.email],
        ['phone', 'phone_lookup', protectedPii.lookups.phone],
        ['whatsapp', 'whatsapp_lookup', protectedPii.lookups.whatsapp],
        ['cpf', 'cpf_lookup', protectedPii.lookups.cpf],
      ];
      for (const [inputField, column, value] of protectedFields) {
        if (input[inputField] !== undefined) updateField(column, value);
      }
      if (input.name !== undefined) updateField('name', protectedPii.placeholderName);
      for (const [inputField, column] of [
        ['email', 'email'],
        ['phone', 'phone'],
        ['whatsapp', 'whatsapp'],
        ['address', 'address'],
        ['city', 'city'],
        ['state', 'state'],
        ['postalCode', 'postal_code'],
        ['cpf', 'cpf'],
        ['notes', 'notes'],
      ] as const) {
        if (input[inputField] !== undefined) updateField(column, null);
      }
    } else {
      updateField('name', input.name);
      updateField('email', input.email);
      updateField('phone', input.phone);
      updateField('whatsapp', input.whatsapp);
      updateField('address', input.address);
      updateField('city', input.city);
      updateField('state', input.state);
      updateField('postal_code', input.postalCode);
      updateField('cpf', input.cpf);
      updateField('notes', input.notes);
    }
    updateField('preferred_channel', input.preferredChannel);
    updateField('deleted_at', input.deletedAt);

    if (fields.length === 0) {
      logger.warn('ContactRepository.update called with no fields to update', { id });
      return this.findById(id) as Promise<Contact>;
    }

    const sql = `
      UPDATE contacts 
      SET ${fields.join(', ')}
      WHERE tenant_id = $1 AND id = $${paramIndex++} AND deleted_at IS NULL
      RETURNING *
    `;
    params.push(id);

    try {
      const result = await query<ContactRow>(sql, params);
      if (result.rows.length === 0) {
        throw new Error('Contact not found or already deleted');
      }
      logger.info('Contact updated', { contactId: id });
      return mapStoredContact(result.rows[0]);
    } catch (error) {
      logger.error('Error updating contact', error as Error, { id });
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
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
    `;

    try {
      const result = await query(sql, [config.chatwoot.accountId, id]);
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
