import pg from 'pg';
import { config, validateConfig } from '../config/index.js';
import { mapStoredContact, protectContactPii } from '../modules/contacts/pii.js';
import type { ContactRow, CreateContactInput } from '../modules/contacts/types.js';

const { Client } = pg;

const BATCH_SIZE = 100;

function plaintextInput(row: ContactRow): CreateContactInput {
  const stored = typeof row.pii_encrypted === 'string'
    ? JSON.parse(row.pii_encrypted) as Record<string, unknown>
    : row.pii_encrypted;
  if (stored?.name) {
    const contact = mapStoredContact(row);
    return {
      name: contact.name,
      email: contact.email || undefined,
      phone: contact.phone || undefined,
      whatsapp: contact.whatsapp || undefined,
      address: contact.address || undefined,
      city: contact.city || undefined,
      state: contact.state || undefined,
      postalCode: contact.postalCode || undefined,
      cpf: contact.cpf || undefined,
      notes: contact.notes || undefined,
    };
  }
  return {
    name: row.name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    whatsapp: row.whatsapp || undefined,
    address: row.address || undefined,
    city: row.city || undefined,
    state: row.state || undefined,
    postalCode: row.postal_code || undefined,
    cpf: row.cpf || undefined,
    notes: row.notes || undefined,
  };
}

export async function backfillContactPii(client: pg.Client, tenantId: string): Promise<number> {
  let migrated = 0;
  let hasFullBatch = true;
  while (hasFullBatch) {
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const candidates = await client.query<ContactRow>(`
        SELECT * FROM contacts
        WHERE tenant_id = $1
          AND (
            NOT (pii_encrypted ? 'name')
            OR split_part(pii_encrypted ->> 'name', '.', 2) <> $3
          )
        ORDER BY id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      `, [tenantId, BATCH_SIZE, config.pii.activeKeyId]);

      for (const row of candidates.rows) {
        const protectedPii = protectContactPii(tenantId, row.id, plaintextInput(row));
        await client.query(`
          UPDATE contacts SET
            name = $3,
            email = NULL,
            phone = NULL,
            whatsapp = NULL,
            address = NULL,
            city = NULL,
            state = NULL,
            postal_code = NULL,
            cpf = NULL,
            notes = NULL,
            pii_encrypted = $4::JSONB,
            name_lookup = $5,
            email_lookup = $6,
            phone_lookup = $7,
            whatsapp_lookup = $8,
            cpf_lookup = $9
          WHERE tenant_id = $1 AND id = $2
        `, [
          tenantId,
          row.id,
          protectedPii.placeholderName,
          JSON.stringify(protectedPii.encrypted),
          protectedPii.lookups.name,
          protectedPii.lookups.email,
          protectedPii.lookups.phone,
          protectedPii.lookups.whatsapp,
          protectedPii.lookups.cpf,
        ]);
      }
      await client.query('COMMIT');
      migrated += candidates.rows.length;
      hasFullBatch = candidates.rows.length === BATCH_SIZE;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  return migrated;
}

async function main(): Promise<void> {
  if (!config.pii.encryptionRequired) {
    throw new Error('PII_ENCRYPTION_REQUIRED=true is required for the contact PII backfill');
  }
  const validation = validateConfig();
  const piiErrors = validation.errors.filter((error) => error.startsWith('PII '));
  if (piiErrors.length > 0) throw new Error(piiErrors.join('; '));

  const client = new Client({ connectionString: config.database.url });
  await client.connect();
  try {
    const migrated = await backfillContactPii(client, config.chatwoot.accountId);
    process.stdout.write(`${JSON.stringify({ migrated })}\n`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`Contact PII backfill failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
