import { NextFunction, Request, Response } from 'express';
import { authenticateApi, requirePermission } from '../../src/middleware/auth';

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
  it('authenticates requests with a valid x-api-key', () => {
    const req = createRequest({ 'x-api-key': 'test-admin-token', 'x-user-role': 'manager' });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    authenticateApi(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({
      id: 'api-client',
      role: 'manager',
      email: undefined,
    });
  });

  it('authenticates requests with a bearer token', () => {
    const req = createRequest({ authorization: 'Bearer test-admin-token' });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    authenticateApi(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.role).toBe('admin');
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
