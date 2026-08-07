import { config } from '../../config/index.js';
import { query } from '../../shared/db/index.js';
import { FieldEncryptionService } from '../security/field-encryption.js';
import type { Contact, ContactRow, CreateContactInput, UpdateContactInput } from './types.js';
import { mapRowToContact } from './types.js';

const PII_FIELDS = [
  'name',
  'email',
  'phone',
  'whatsapp',
  'address',
  'city',
  'state',
  'postalCode',
  'cpf',
  'notes',
] as const;

type ContactPiiField = typeof PII_FIELDS[number];
type ContactPiiValues = Partial<Record<ContactPiiField, string | null>>;
type EncryptedContactPii = Partial<Record<ContactPiiField, string | null>>;

export interface ProtectedContactPii {
  encrypted: EncryptedContactPii;
  placeholderName?: string;
  lookups: {
    name: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    cpf: string | null;
  };
}

function encryptionService(): FieldEncryptionService {
  let keys: unknown;
  try {
    keys = JSON.parse(config.pii.encryptionKeysJson);
  } catch {
    throw new Error('PII encryption key ring is not valid JSON');
  }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    throw new Error('PII encryption key ring must be an object');
  }
  return new FieldEncryptionService({
    activeKeyId: config.pii.activeKeyId,
    keys: keys as Record<string, string>,
    lookupKey: config.pii.lookupKey,
  });
}

function normalize(value: string, field: ContactPiiField): string {
  const compact = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (field === 'phone' || field === 'whatsapp' || field === 'cpf' || field === 'postalCode') {
    return compact.replace(/\D/g, '');
  }
  return compact.toLocaleLowerCase('pt-BR');
}

function lookup(
  service: FieldEncryptionService,
  tenantId: string,
  field: ContactPiiField,
  value: string | null | undefined
): string | null {
  if (!value) return null;
  return service.blindIndex(normalize(value, field), `${tenantId}:contact.${field}`);
}

function contactValues(input: CreateContactInput | UpdateContactInput): ContactPiiValues {
  const values: ContactPiiValues = {};
  for (const field of PII_FIELDS) {
    if (input[field] !== undefined) values[field] = input[field] || null;
  }
  return values;
}

function parseEncryptedPii(value: ContactRow['pii_encrypted']): EncryptedContactPii {
  if (!value) return {};
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Encrypted contact PII is malformed');
    }
    return parsed as EncryptedContactPii;
  }
  return value;
}

export function isContactPiiEncryptionEnabled(): boolean {
  return Boolean(config.pii?.encryptionRequired);
}

export function contactBlindIndex(field: ContactPiiField, value: string): string {
  return lookup(encryptionService(), config.chatwoot.accountId, field, value) as string;
}

export function protectContactPii(
  tenantId: string,
  contactId: string,
  input: CreateContactInput | UpdateContactInput
): ProtectedContactPii {
  const service = encryptionService();
  const values = contactValues(input);
  const encrypted: EncryptedContactPii = {};

  for (const [field, value] of Object.entries(values) as [ContactPiiField, string | null][]) {
    encrypted[field] = value === null
      ? null
      : service.encrypt(value, { tenantId, entity: 'contact', entityId: contactId, field });
  }

  const nameLookup = lookup(service, tenantId, 'name', values.name);
  return {
    encrypted,
    placeholderName: values.name === undefined
      ? undefined
      : nameLookup ? `protected-${nameLookup.slice(0, 16)}` : 'protected-contact',
    lookups: {
      name: nameLookup,
      email: lookup(service, tenantId, 'email', values.email),
      phone: lookup(service, tenantId, 'phone', values.phone),
      whatsapp: lookup(service, tenantId, 'whatsapp', values.whatsapp),
      cpf: lookup(service, tenantId, 'cpf', values.cpf),
    },
  };
}

export function mapStoredContact(row: ContactRow): Contact {
  if (!isContactPiiEncryptionEnabled()) return mapRowToContact(row);

  const encrypted = parseEncryptedPii(row.pii_encrypted);
  if (!encrypted.name && !row.deleted_at) {
    throw new Error('Active contact contains unencrypted legacy PII; run the PII backfill');
  }

  const service = encryptionService();
  const decrypted: ContactPiiValues = {};
  for (const [field, envelope] of Object.entries(encrypted) as [ContactPiiField, string | null][]) {
    decrypted[field] = envelope === null
      ? null
      : service.decrypt(envelope, {
        tenantId: row.tenant_id,
        entity: 'contact',
        entityId: row.id,
        field,
      });
  }

  return mapRowToContact({
    ...row,
    name: decrypted.name ?? row.name,
    email: decrypted.email ?? null,
    phone: decrypted.phone ?? null,
    whatsapp: decrypted.whatsapp ?? null,
    address: decrypted.address ?? null,
    city: decrypted.city ?? null,
    state: decrypted.state ?? null,
    postal_code: decrypted.postalCode ?? null,
    cpf: decrypted.cpf ?? null,
    notes: decrypted.notes ?? null,
  });
}

export async function assertContactPiiReady(): Promise<void> {
  if (!isContactPiiEncryptionEnabled()) return;
  const result = await query<{ unprotected: string }>(`
    SELECT COUNT(*)::TEXT AS unprotected
    FROM contacts
    WHERE (pii_encrypted IS NULL OR NOT (pii_encrypted ? 'name'))
      AND (
        deleted_at IS NULL
        OR email IS NOT NULL OR phone IS NOT NULL OR whatsapp IS NOT NULL
        OR address IS NOT NULL OR city IS NOT NULL OR state IS NOT NULL
        OR postal_code IS NOT NULL OR cpf IS NOT NULL OR notes IS NOT NULL
        OR name NOT LIKE 'anonymous-%'
      )
  `);
  if (Number(result.rows[0]?.unprotected || 0) > 0) {
    throw new Error('PII encryption is required but active legacy contacts still need backfill');
  }
}
