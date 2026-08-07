import { describe, expect, it } from 'vitest';
import { FieldEncryptionService } from '../../src/modules/security/field-encryption';

const oldKey = Buffer.alloc(32, 1).toString('base64');
const activeKey = Buffer.alloc(32, 2).toString('base64');
const lookupKey = Buffer.alloc(32, 3).toString('base64');
const context = {
  tenantId: '42',
  entity: 'contact',
  entityId: '35e51a93-9aa4-4d4d-8599-aad99c610338',
  field: 'email',
};

function service(activeKeyId = 'key-2026'): FieldEncryptionService {
  return new FieldEncryptionService({
    activeKeyId,
    keys: { 'key-2025': oldKey, 'key-2026': activeKey },
    lookupKey,
  });
}

describe('FieldEncryptionService', () => {
  it('encrypts with randomized AES-GCM envelopes and authenticates the field context', () => {
    const encryption = service();
    const first = encryption.encrypt('maria@example.com', context);
    const second = encryption.encrypt('maria@example.com', context);

    expect(first).not.toBe(second);
    expect(first).toMatch(/^encv1\.key-2026\./);
    expect(encryption.decrypt(first, context)).toBe('maria@example.com');
    expect(() => encryption.decrypt(first, { ...context, tenantId: '43' })).toThrow();
    expect(() => encryption.decrypt(`${first.slice(0, -1)}x`, context)).toThrow();
  });

  it('decrypts records written with a retained rotation key', () => {
    const beforeRotation = service('key-2025');
    const encrypted = beforeRotation.encrypt('maria@example.com', context);

    expect(service('key-2026').decrypt(encrypted, context)).toBe('maria@example.com');
  });

  it('creates deterministic purpose-bound lookup indexes without exposing plaintext', () => {
    const encryption = service();
    const emailIndex = encryption.blindIndex('maria@example.com', 'contact.email');

    expect(emailIndex).toHaveLength(64);
    expect(emailIndex).toBe(encryption.blindIndex('maria@example.com', 'contact.email'));
    expect(emailIndex).not.toBe(encryption.blindIndex('maria@example.com', 'contact.phone'));
    expect(emailIndex).not.toContain('maria');
  });

  it('rejects missing active keys and invalid key sizes', () => {
    expect(() => new FieldEncryptionService({
      activeKeyId: 'missing',
      keys: { active: activeKey },
      lookupKey,
    })).toThrow('Active encryption key');
    expect(() => new FieldEncryptionService({
      activeKeyId: 'active',
      keys: { active: Buffer.alloc(16).toString('base64') },
      lookupKey,
    })).toThrow('exactly 32 bytes');
  });
});
