import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyIdentityToken } from '../../src/modules/auth/token-verifier';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const otherPrivateKey = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
}).privateKey;

const now = 1_800_000_000;
const verification = {
  publicKey,
  issuer: 'https://identity.example.test',
  audience: 'cvg-agent-secretary',
  now,
};

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createToken(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
  signingKey = privateKey
): string {
  const encodedHeader = encodeJson({ alg: 'RS256', typ: 'JWT', ...header });
  const encodedPayload = encodeJson({
    iss: verification.issuer,
    aud: verification.audience,
    sub: 'user-123',
    role: 'manager',
    email: 'manager@example.test',
    exp: now + 300,
    nbf: now - 10,
    ...claims,
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), signingKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

describe('signed identity token verification', () => {
  it('returns identity only from valid signed claims', () => {
    expect(verifyIdentityToken(createToken({ name: 'Test Manager' }), verification)).toEqual({
      id: 'user-123',
      role: 'manager',
      email: 'manager@example.test',
      name: 'Test Manager',
    });
  });

  it('rejects an expired token', () => {
    expect(() => verifyIdentityToken(createToken({ exp: now }), verification)).toThrow('expired');
  });

  it('rejects a token before its not-before time', () => {
    expect(() => verifyIdentityToken(createToken({ nbf: now + 1 }), verification)).toThrow('not active');
  });

  it('rejects the wrong issuer', () => {
    expect(() => verifyIdentityToken(createToken({ iss: 'https://attacker.example' }), verification))
      .toThrow('issuer');
  });

  it('rejects the wrong audience', () => {
    expect(() => verifyIdentityToken(createToken({ aud: 'another-service' }), verification))
      .toThrow('audience');
  });

  it('rejects any algorithm other than RS256', () => {
    expect(() => verifyIdentityToken(createToken({}, { alg: 'HS256' }), verification))
      .toThrow('algorithm');
  });

  it('rejects a signature from a different key', () => {
    expect(() => verifyIdentityToken(createToken({}, {}, otherPrivateKey), verification))
      .toThrow('signature');
  });

  it('rejects a role outside the server role allowlist', () => {
    expect(() => verifyIdentityToken(createToken({ role: 'superadmin' }), verification))
      .toThrow('role');
  });

  it('normalizes escaped newlines when loading the public key from the environment', async () => {
    const previousPublicKey = process.env.API_JWT_PUBLIC_KEY;
    process.env.API_JWT_PUBLIC_KEY = publicKey.replace(/\n/g, '\\n');
    vi.resetModules();

    try {
      const { config: reloadedConfig } = await import('../../src/config');
      expect(reloadedConfig.auth.jwtPublicKey).toBe(publicKey);
    } finally {
      if (previousPublicKey === undefined) {
        delete process.env.API_JWT_PUBLIC_KEY;
      } else {
        process.env.API_JWT_PUBLIC_KEY = previousPublicKey;
      }
      vi.resetModules();
    }
  });
});
