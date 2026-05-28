import { NextFunction, Request, Response } from 'express';
import {
  computeChatwootSignature,
  verifyChatwootSignature,
} from '../../src/middleware/chatwoot-signature';

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

function createRequest(rawBody: Buffer, signature?: string) {
  return {
    rawBody,
    header: vi.fn((name: string) => {
      if (name.toLowerCase() === 'x-chatwoot-signature') return signature;
      return undefined;
    }),
  } as unknown as Request;
}

describe('chatwoot signature middleware', () => {
  it('accepts a valid sha256 signature', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: 'message_created' }));
    const signature = computeChatwootSignature(rawBody, 'test-webhook-secret');
    const req = createRequest(rawBody, `sha256=${signature}`);
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    verifyChatwootSignature(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects missing signatures when secret is configured', () => {
    const req = createRequest(Buffer.from('{}'));
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    verifyChatwootSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid webhook signature' });
  });

  it('rejects invalid signatures', () => {
    const req = createRequest(Buffer.from('{}'), 'sha256=deadbeef');
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    verifyChatwootSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
