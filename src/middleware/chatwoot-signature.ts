import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../modules/logging';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

function normalizeSignature(signature: string): string {
  return signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
}

function getSignatureHeader(req: Request): string | undefined {
  return (
    req.header('x-chatwoot-signature') ||
    req.header('x-hub-signature-256') ||
    req.header('x-signature')
  );
}

function safeCompareHex(expected: string, actual: string): boolean {
  try {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');

    if (expectedBuffer.length === 0 || expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  } catch {
    return false;
  }
}

export function computeChatwootSignature(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyChatwootSignature(req: Request, res: Response, next: NextFunction): void {
  const secret = config.chatwoot.webhookSecret;

  if (!secret) {
    next();
    return;
  }

  const signature = getSignatureHeader(req);
  const rawBody = req.rawBody;

  if (!signature || !rawBody) {
    logger.warn('Chatwoot webhook signature missing', {
      hasSignature: Boolean(signature),
      hasRawBody: Boolean(rawBody),
    });
    res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    return;
  }

  const expected = computeChatwootSignature(rawBody, secret);
  const actual = normalizeSignature(signature);

  if (!safeCompareHex(expected, actual)) {
    logger.warn('Chatwoot webhook signature invalid');
    res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    return;
  }

  next();
}
