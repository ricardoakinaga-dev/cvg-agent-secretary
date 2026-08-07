const testConfig = vi.hoisted(() => ({
  chatwoot: { accountId: '42' },
  pii: {
    encryptionRequired: true,
    activeKeyId: 'backfill-key',
    encryptionKeysJson: JSON.stringify({
      'backfill-key': Buffer.alloc(32, 21).toString('base64'),
      'retired-key': Buffer.alloc(32, 20).toString('base64'),
    }),
    lookupKey: Buffer.alloc(32, 22).toString('base64'),
  },
}));

vi.mock('../../src/config', () => ({
  config: testConfig,
  validateConfig: () => ({ valid: true, errors: [] }),
}));
vi.mock('../../src/shared/db', () => ({ query: vi.fn() }));

import { backfillContactPii } from '../../src/scripts/backfill-contact-pii';
import { FieldEncryptionService } from '../../src/modules/security/field-encryption';

describe('contact PII backfill', () => {
  it('encrypts legacy rows atomically and removes every plaintext sensitive column', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT * FROM contacts')) {
        return {
          rows: [{
            id: '35e51a93-9aa4-4d4d-8599-aad99c610338',
            tenant_id: '42',
            chatwoot_id: 7,
            name: 'Maria',
            email: 'maria@example.com',
            phone: '+55 11 99999-0000',
            whatsapp: null,
            address: 'Rua A, 1',
            city: 'São Paulo',
            state: 'SP',
            postal_code: '01000-000',
            cpf: '123.456.789-00',
            preferred_channel: 'chatwoot',
            notes: 'observação',
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(backfillContactPii({ query } as never, '42')).resolves.toBe(1);

    expect(query.mock.calls.map(([sql]) => sql.trim())).toEqual(expect.arrayContaining([
      'BEGIN',
      'COMMIT',
    ]));
    const updateCall = query.mock.calls.find(([sql]) => sql.includes('UPDATE contacts'));
    expect(updateCall).toBeDefined();
    if (!updateCall) throw new Error('Expected contact update');
    const [updateSql, params = []] = updateCall;
    expect(updateSql).toContain('email = NULL');
    expect(updateSql).toContain('cpf = NULL');
    expect(params).not.toContain('Maria');
    expect(params).not.toContain('maria@example.com');
    expect(String(params[3])).toContain('encv1.backfill-key');
  });

  it('rolls back if any row cannot be persisted', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT * FROM contacts')) {
        return {
          rows: [{
            id: '35e51a93-9aa4-4d4d-8599-aad99c610338',
            tenant_id: '42',
            chatwoot_id: null,
            name: 'Maria',
            email: null,
            phone: null,
            whatsapp: null,
            address: null,
            city: null,
            state: null,
            postal_code: null,
            cpf: null,
            preferred_channel: 'chatwoot',
            notes: null,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('UPDATE contacts')) throw new Error('database unavailable');
      return { rows: [], rowCount: 0 };
    });

    await expect(backfillContactPii({ query } as never, '42')).rejects.toThrow('database unavailable');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('decrypts retained keys and re-encrypts every field with the active rotation key', async () => {
    const id = '35e51a93-9aa4-4d4d-8599-aad99c610338';
    const oldService = new FieldEncryptionService({
      activeKeyId: 'retired-key',
      keys: JSON.parse(testConfig.pii.encryptionKeysJson),
      lookupKey: testConfig.pii.lookupKey,
    });
    const encrypt = (field: string, value: string) => oldService.encrypt(value, {
      tenantId: '42', entity: 'contact', entityId: id, field,
    });
    const encrypted = {
      name: encrypt('name', 'Maria'),
      email: encrypt('email', 'maria@example.com'),
    };
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT * FROM contacts')) {
        return {
          rows: [{
            id,
            tenant_id: '42',
            chatwoot_id: null,
            name: 'protected-old',
            email: null,
            phone: null,
            whatsapp: null,
            address: null,
            city: null,
            state: null,
            postal_code: null,
            cpf: null,
            preferred_channel: 'chatwoot',
            notes: null,
            pii_encrypted: encrypted,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await backfillContactPii({ query } as never, '42');

    const selectCall = query.mock.calls.find(([sql]) => sql.includes('SELECT * FROM contacts'));
    expect(selectCall?.[1]).toEqual(['42', 100, 'backfill-key']);
    const updateCall = query.mock.calls.find(([sql]) => sql.includes('UPDATE contacts'));
    if (!updateCall) throw new Error('Expected contact rotation update');
    const rotated = JSON.parse(String(updateCall[1]?.[3])) as Record<string, string>;
    expect(rotated.name).toMatch(/^encv1\.backfill-key\./);
    expect(rotated.email).toMatch(/^encv1\.backfill-key\./);
    expect(JSON.stringify(rotated)).not.toContain('maria@example.com');
  });
});
