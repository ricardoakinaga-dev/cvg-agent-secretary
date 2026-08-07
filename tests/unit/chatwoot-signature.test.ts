import { NextFunction, Request, Response } from 'express';
import { createHmac } from 'crypto';
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

function createRequest(rawBody: Buffer, signature?: string, timestamp?: string) {
  return {
    rawBody,
    body: JSON.parse(rawBody.toString('utf8')),
    header: vi.fn((name: string) => {
      if (name.toLowerCase() === 'x-chatwoot-signature') return signature;
      if (name.toLowerCase() === 'x-chatwoot-timestamp') return timestamp;
      return undefined;
    }),
  } as unknown as Request;
}

describe('chatwoot signature middleware', () => {
  it('rejects a valid legacy signature without a timestamp', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: 'message_created' }));
    const signature = createHmac('sha256', 'test-webhook-secret').update(rawBody).digest('hex');
    const req = createRequest(rawBody, `sha256=${signature}`);
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    verifyChatwootSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts the current Chatwoot timestamped signature format', () => {
    const rawBody = Buffer.from(JSON.stringify({
      event: 'message_created',
      conversation: { account_id: 1, inbox_id: 2 },
    }));
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = computeChatwootSignature(rawBody, 'test-webhook-secret', timestamp);
    const req = createRequest(rawBody, `sha256=${signature}`, timestamp);
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    verifyChatwootSignature(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a valid signature from an account or inbox outside the configured source', () => {
    const rawBody = Buffer.from(JSON.stringify({
      event: 'message_created',
      conversation: { account_id: 9, inbox_id: 99 },
    }));
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = computeChatwootSignature(rawBody, 'test-webhook-secret', timestamp);
    const req = createRequest(rawBody, `sha256=${signature}`, timestamp);
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    verifyChatwootSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Webhook source not allowed' });
  });

  it.each([
    ['not-a-timestamp', 'an invalid timestamp'],
    [Math.floor((Date.now() - 5 * 60_000 - 1_000) / 1000).toString(), 'a stale timestamp'],
    [Math.floor((Date.now() + 5 * 60_000 + 1_000) / 1000).toString(), 'a future timestamp'],
  ])('rejects a valid signature carrying %s (%s)', (timestamp) => {
    const rawBody = Buffer.from(JSON.stringify({ event: 'message_created' }));
    const signature = computeChatwootSignature(rawBody, 'test-webhook-secret', timestamp);
    const req = createRequest(rawBody, `sha256=${signature}`, timestamp);
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    verifyChatwootSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid webhook signature' });
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

  it('fails closed when the webhook secret is unavailable', async () => {
    const { config } = await import('../../src/config');
    const originalSecret = config.chatwoot.webhookSecret;
    config.chatwoot.webhookSecret = '';

    try {
      const req = createRequest(Buffer.from('{}'), 'sha256=deadbeef', Math.floor(Date.now() / 1000).toString());
      const res = createResponse();
      const next = vi.fn() as NextFunction;

      verifyChatwootSignature(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(503);
    } finally {
      config.chatwoot.webhookSecret = originalSecret;
    }
  });

  it.each([
    'sha256=' + 'g'.repeat(64),
    'sha256=' + 'a'.repeat(63),
    'sha256=' + 'a'.repeat(65),
  ])('rejects malformed digest %s', (malformedSignature) => {
    const rawBody = Buffer.from('{}');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const req = createRequest(rawBody, malformedSignature, timestamp);
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    verifyChatwootSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
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
