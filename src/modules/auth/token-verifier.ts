import { verify } from 'node:crypto';
import { isValidRole, UserContext } from './rbac';

const MAX_TOKEN_LENGTH = 16_384;
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

export interface IdentityTokenVerification {
  publicKey: string;
  issuer: string;
  audience: string;
  now?: number;
}

type JsonObject = Record<string, unknown>;

function decodeJsonSegment(segment: string, label: string): JsonObject {
  if (!segment || !BASE64URL_SEGMENT.test(segment)) {
    throw new Error(`Invalid JWT ${label}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new Error(`Invalid JWT ${label}`);
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid JWT ${label}`);
  }

  return value as JsonObject;
}

function hasAudience(claim: unknown, expected: string): boolean {
  if (typeof claim === 'string') {
    return claim === expected;
  }

  return Array.isArray(claim)
    && claim.every((entry) => typeof entry === 'string')
    && claim.includes(expected);
}

function optionalStringClaim(claim: unknown): string | undefined {
  return typeof claim === 'string' && claim.length > 0 ? claim : undefined;
}

export function verifyIdentityToken(
  token: string,
  verification: IdentityTokenVerification
): UserContext {
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new Error('Invalid JWT format');
  }

  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new Error('Invalid JWT format');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJsonSegment(encodedHeader, 'header');
  const claims = decodeJsonSegment(encodedPayload, 'payload');

  if (header.alg !== 'RS256') {
    throw new Error('Invalid JWT algorithm');
  }

  if (!BASE64URL_SEGMENT.test(encodedSignature)) {
    throw new Error('Invalid JWT signature');
  }

  const signatureValid = verify(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    verification.publicKey,
    Buffer.from(encodedSignature, 'base64url')
  );
  if (!signatureValid) {
    throw new Error('Invalid JWT signature');
  }

  if (claims.iss !== verification.issuer) {
    throw new Error('Invalid JWT issuer');
  }
  if (!hasAudience(claims.aud, verification.audience)) {
    throw new Error('Invalid JWT audience');
  }

  const now = verification.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now) {
    throw new Error('JWT is expired');
  }
  if (claims.nbf !== undefined
    && (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > now)) {
    throw new Error('JWT is not active');
  }
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new Error('Invalid JWT subject');
  }
  if (typeof claims.role !== 'string' || !isValidRole(claims.role)) {
    throw new Error('Invalid JWT role');
  }

  return {
    id: claims.sub,
    role: claims.role,
    email: optionalStringClaim(claims.email),
    name: optionalStringClaim(claims.name),
  };
}
