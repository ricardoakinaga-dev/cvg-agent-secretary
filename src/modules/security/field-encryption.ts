import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

const ENVELOPE_VERSION = 'encv1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface FieldEncryptionContext {
  tenantId: string;
  entity: string;
  entityId: string;
  field: string;
}

export interface FieldEncryptionOptions {
  activeKeyId: string;
  keys: Readonly<Record<string, string>>;
  lookupKey: string;
}

function decodeKey(value: string, label: string): Buffer {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== KEY_BYTES) {
    throw new Error(`${label} must decode to exactly ${KEY_BYTES} bytes`);
  }
  return decoded;
}

function decodeBase64Url(value: string, expectedLength?: number): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error('Invalid encrypted field envelope');
  }

  const decoded = Buffer.from(value, 'base64url');
  if (
    decoded.toString('base64url') !== value
    || (expectedLength !== undefined && decoded.length !== expectedLength)
  ) {
    throw new Error('Invalid encrypted field envelope');
  }

  return decoded;
}

function associatedData(context: FieldEncryptionContext): Buffer {
  return Buffer.from([
    ENVELOPE_VERSION,
    context.tenantId,
    context.entity,
    context.entityId,
    context.field,
  ].join(':'), 'utf8');
}

function requireContext(context: FieldEncryptionContext): void {
  if (Object.values(context).some((value) => !value.trim())) {
    throw new Error('Encryption context fields must not be empty');
  }
}

export class FieldEncryptionService {
  private readonly activeKeyId: string;
  private readonly keys: ReadonlyMap<string, Buffer>;
  private readonly lookupKey: Buffer;

  constructor(options: FieldEncryptionOptions) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(options.activeKeyId)) {
      throw new Error('Invalid active encryption key id');
    }

    const keys = new Map(
      Object.entries(options.keys).map(([keyId, value]) => {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId)) {
          throw new Error('Invalid encryption key id');
        }
        return [keyId, decodeKey(value, `Encryption key ${keyId}`)] as const;
      })
    );
    if (!keys.has(options.activeKeyId)) {
      throw new Error('Active encryption key is not present in the key ring');
    }

    this.activeKeyId = options.activeKeyId;
    this.keys = keys;
    this.lookupKey = decodeKey(options.lookupKey, 'Lookup key');
  }

  encrypt(value: string, context: FieldEncryptionContext): string {
    requireContext(context);
    const key = this.keys.get(this.activeKeyId);
    if (!key) throw new Error('Active encryption key is unavailable');

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_BYTES });
    cipher.setAAD(associatedData(context));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      ENVELOPE_VERSION,
      this.activeKeyId,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(envelope: string, context: FieldEncryptionContext): string {
    requireContext(context);
    const [version, keyId, ivValue, tagValue, ciphertextValue, extra] = envelope.split('.');
    if (
      version !== ENVELOPE_VERSION
      || !keyId
      || !ivValue
      || !tagValue
      || ciphertextValue === undefined
      || extra !== undefined
    ) {
      throw new Error('Invalid encrypted field envelope');
    }

    const key = this.keys.get(keyId);
    if (!key) throw new Error('Encryption key required by field is unavailable');
    const iv = decodeBase64Url(ivValue, IV_BYTES);
    const tag = decodeBase64Url(tagValue, AUTH_TAG_BYTES);
    const ciphertext = decodeBase64Url(ciphertextValue);

    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_BYTES });
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  blindIndex(value: string, purpose: string): string {
    if (!purpose.trim()) throw new Error('Blind-index purpose must not be empty');
    return createHmac('sha256', this.lookupKey)
      .update(`${ENVELOPE_VERSION}:${purpose}:${value}`, 'utf8')
      .digest('hex');
  }
}
