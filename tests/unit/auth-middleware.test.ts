import { NextFunction, Request, Response } from 'express';
import { generateKeyPairSync, sign } from 'node:crypto';
import { config, validateConfig } from '../../src/config';
import { authenticateApi, requirePermission } from '../../src/middleware/auth';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function createIdentityToken(claims: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://identity.example.test',
    aud: 'cvg-agent-secretary',
    sub: 'signed-user',
    role: 'agent',
    exp: Math.floor(Date.now() / 1000) + 300,
    nbf: Math.floor(Date.now() / 1000) - 10,
    ...claims,
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

function createResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

function createRequest(headers: Record<string, string> = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    path: '/api/metrics',
    header: vi.fn((name: string) => normalized[name.toLowerCase()]),
  } as unknown as Request;
}

describe('auth middleware', () => {
  const originalAuth = { ...config.auth };
  const originalProduction = config.isProduction;

  beforeEach(() => {
    Object.assign(config.auth, {
      apiToken: '',
      jwtPublicKey: publicKey,
      jwtIssuer: 'https://identity.example.test',
      jwtAudience: 'cvg-agent-secretary',
      allowLegacyApiToken: false,
    });
    config.isProduction = false;
  });

  afterAll(() => {
    Object.assign(config.auth, originalAuth);
    config.isProduction = originalProduction;
  });

  it('authenticates a valid signed bearer identity and ignores client identity headers', () => {
    const req = createRequest({
      authorization: `Bearer ${createIdentityToken({ email: 'signed@example.test' })}`,
      'x-user-id': 'attacker',
      'x-user-role': 'admin',
      'x-user-email': 'attacker@example.test',
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    authenticateApi(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({
      id: 'signed-user',
      role: 'agent',
      email: 'signed@example.test',
    });
  });

  it('maps an explicitly enabled non-production legacy token to a fixed principal', () => {
    Object.assign(config.auth, {
      apiToken: 'test-admin-token',
      allowLegacyApiToken: true,
    });
    const req = createRequest({ 'x-api-key': 'test-admin-token' });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    authenticateApi(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({
      id: 'legacy-api-service',
      role: 'manager',
    });
  });

  it('does not accept client-defined identity claims for a legacy token', () => {
    Object.assign(config.auth, {
      apiToken: 'test-admin-token',
      allowLegacyApiToken: true,
    });
    const req = createRequest({
      authorization: 'Bearer test-admin-token',
      'x-user-id': 'attacker',
      'x-user-role': 'admin',
      'x-user-email': 'attacker@example.com',
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    authenticateApi(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({
      id: 'legacy-api-service',
      role: 'manager',
    });
    expect(req.user?.role).not.toBe('admin');
  });

  it('rejects missing or invalid tokens', () => {
    const req = createRequest({ 'x-api-key': 'wrong-token' });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    authenticateApi(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
  });

  it('never accepts the legacy token in production', () => {
    Object.assign(config.auth, {
      apiToken: 'test-admin-token',
      allowLegacyApiToken: true,
    });
    config.isProduction = true;
    const req = createRequest({ 'x-api-key': 'test-admin-token' });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    authenticateApi(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('requires complete signed-token configuration in production', () => {
    Object.assign(config.auth, {
      jwtPublicKey: '',
      jwtIssuer: '',
      jwtAudience: '',
      allowLegacyApiToken: false,
    });
    config.isProduction = true;

    const result = validateConfig();

    expect(result.errors).toContain('API_JWT_PUBLIC_KEY is required in production');
    expect(result.errors).toContain('API_JWT_ISSUER is required in production');
    expect(result.errors).toContain('API_JWT_AUDIENCE is required in production');
  });

  it('rejects the legacy authentication fallback in production', () => {
    config.auth.allowLegacyApiToken = true;
    config.isProduction = true;

    expect(validateConfig().errors)
      .toContain('ALLOW_LEGACY_API_TOKEN must be false in production');
  });

  it('rejects a malformed production JWT public key', () => {
    config.auth.jwtPublicKey = 'not-a-public-key';
    config.isProduction = true;

    expect(validateConfig().errors)
      .toContain('API_JWT_PUBLIC_KEY must be a valid RSA public key');
  });

  it('allows users with the required permission', () => {
    const req = createRequest();
    req.user = { id: 'u1', role: 'viewer' };
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requirePermission('analytics:read')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects users without the required permission', () => {
    const req = createRequest();
    req.user = { id: 'u1', role: 'viewer' };
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requirePermission('audit:read')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Forbidden' });
  });
});
