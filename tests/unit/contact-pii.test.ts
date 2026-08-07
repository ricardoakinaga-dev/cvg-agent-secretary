const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  config: {
    chatwoot: { accountId: '42' },
    pii: {
      encryptionRequired: true,
      activeKeyId: 'contact-key-2026',
      encryptionKeysJson: JSON.stringify({
        'contact-key-2026': Buffer.alloc(32, 11).toString('base64'),
      }),
      lookupKey: Buffer.alloc(32, 12).toString('base64'),
    },
  },
}));

vi.mock('../../src/shared/db', () => ({ query: mocks.query }));
vi.mock('../../src/config', () => ({ config: mocks.config }));
vi.mock('../../src/modules/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ContactRepository } from '../../src/modules/contacts/repository';
import {
  assertContactPiiReady,
  contactBlindIndex,
  mapStoredContact,
} from '../../src/modules/contacts/pii';
import type { ContactRow } from '../../src/modules/contacts/types';

function returnedRow(params: unknown[]): ContactRow {
  return {
    id: String(params[0]),
    tenant_id: String(params[1]),
    chatwoot_id: params[2] as number | null,
    name: String(params[3]),
    email: null,
    phone: null,
    whatsapp: null,
    address: null,
    city: null,
    state: null,
    postal_code: null,
    cpf: null,
    preferred_channel: String(params[4]),
    notes: null,
    pii_encrypted: JSON.parse(String(params[5])),
    name_lookup: params[6] as string,
    email_lookup: params[7] as string,
    phone_lookup: params[8] as string,
    whatsapp_lookup: params[9] as string,
    cpf_lookup: params[10] as string,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };
}

describe('encrypted contact PII repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores sensitive fields only as authenticated ciphertext and returns decrypted values', async () => {
    mocks.query.mockImplementationOnce(async (_sql: string, params: unknown[]) => ({
      rows: [returnedRow(params)],
      rowCount: 1,
    }));

    const contact = await new ContactRepository().create({
      name: 'Maria da Silva',
      email: 'Maria@Example.com',
      phone: '+55 (11) 99999-0000',
      address: 'Rua das Flores, 123',
      cpf: '123.456.789-00',
      notes: 'Prefere atendimento pela manhã',
    });

    expect(contact.name).toBe('Maria da Silva');
    expect(contact.email).toBe('Maria@Example.com');
    expect(contact.address).toBe('Rua das Flores, 123');
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('pii_encrypted');
    expect(params).not.toContain('Maria da Silva');
    expect(params).not.toContain('Maria@Example.com');
    expect(params).not.toContain('Rua das Flores, 123');
    expect(String(params[5])).not.toContain('Prefere atendimento');
  });

  it('uses normalized tenant-bound blind indexes for exact lookup', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await new ContactRepository().find({ email: '  MARIA@EXAMPLE.COM ' });

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('email_lookup = $2');
    expect(params).toEqual(['42', contactBlindIndex('email', 'maria@example.com')]);
    expect(params).not.toContain('  MARIA@EXAMPLE.COM ');
  });

  it('fails closed for active legacy rows while encryption is mandatory', () => {
    const legacy = returnedRow([
      'contact-1', '42', null, 'Maria', 'chatwoot', '{}', null, null, null, null, null,
    ]);
    legacy.pii_encrypted = {};

    expect(() => mapStoredContact(legacy)).toThrow('unencrypted legacy PII');
  });

  it('blocks startup when the schema readiness query finds unprotected contacts', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ unprotected: '2' }], rowCount: 1 });
    await expect(assertContactPiiReady()).rejects.toThrow('still need backfill');

    mocks.query.mockResolvedValueOnce({ rows: [{ unprotected: '0' }], rowCount: 1 });
    await expect(assertContactPiiReady()).resolves.toBeUndefined();
  });
});
