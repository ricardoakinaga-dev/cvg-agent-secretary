"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactRepository = exports.ContactRepository = void 0;
const index_js_1 = require("../../shared/db/index.js");
const index_js_2 = require("../logging/index.js");
const types_js_1 = require("./types.js");
class ContactRepository {
    /**
     * Find a contact by various search criteria
     */
    async find(input) {
        const conditions = [];
        const params = [];
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
            index_js_2.logger.warn('ContactRepository.find called with no search criteria');
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
            const result = await (0, index_js_1.query)(sql, params);
            if (result.rows.length === 0) {
                return null;
            }
            return (0, types_js_1.mapRowToContact)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error finding contact', error, { input });
            throw error;
        }
    }
    /**
     * Find a contact by ID
     */
    async findById(id) {
        const sql = `
      SELECT * FROM contacts 
      WHERE id = $1 AND deleted_at IS NULL
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [id]);
            if (result.rows.length === 0) {
                return null;
            }
            return (0, types_js_1.mapRowToContact)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error finding contact by ID', error, { id });
            throw error;
        }
    }
    /**
     * Create a new contact
     */
    async create(input) {
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
            const result = await (0, index_js_1.query)(sql, params);
            index_js_2.logger.info('Contact created', { contactId: result.rows[0].id });
            return (0, types_js_1.mapRowToContact)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error creating contact', error, { input });
            throw error;
        }
    }
    /**
     * Create or update a contact based on existence
     */
    async createOrUpdate(input) {
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
            index_js_2.logger.warn('ContactRepository.update called with no fields to update', { id });
            return this.findById(id);
        }
        const sql = `
      UPDATE contacts 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND deleted_at IS NULL
      RETURNING *
    `;
        params.push(id);
        try {
            const result = await (0, index_js_1.query)(sql, params);
            if (result.rows.length === 0) {
                throw new Error('Contact not found or already deleted');
            }
            index_js_2.logger.info('Contact updated', { contactId: id });
            return (0, types_js_1.mapRowToContact)(result.rows[0]);
        }
        catch (error) {
            index_js_2.logger.error('Error updating contact', error, { id, input });
            throw error;
        }
    }
    /**
     * Soft delete a contact
     */
    async delete(id) {
        const sql = `
      UPDATE contacts 
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `;
        try {
            const result = await (0, index_js_1.query)(sql, [id]);
            if (result.rowCount === 0) {
                index_js_2.logger.warn('Contact not found for deletion', { id });
            }
            else {
                index_js_2.logger.info('Contact soft deleted', { contactId: id });
            }
        }
        catch (error) {
            index_js_2.logger.error('Error deleting contact', error, { id });
            throw error;
        }
    }
}
exports.ContactRepository = ContactRepository;
// Export singleton instance
exports.contactRepository = new ContactRepository();
//# sourceMappingURL=repository.js.map