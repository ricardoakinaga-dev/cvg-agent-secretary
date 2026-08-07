import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { validateChatwootSource } from '../modules/chatwoot/normalizer';
import { logger } from '../modules/logging';

const CHATWOOT_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

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
  if (!/^[a-f\d]{64}$/i.test(expected) || !/^[a-f\d]{64}$/i.test(actual)) {
    return false;
  }

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

function isTimestampFresh(timestamp: string): boolean {
  if (!/^\d+$/.test(timestamp)) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - timestampSeconds) <= CHATWOOT_TIMESTAMP_TOLERANCE_SECONDS;
}

export function computeChatwootSignature(
  rawBody: Buffer,
  secret: string,
  timestamp: string
): string {
  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyChatwootSignature(req: Request, res: Response, next: NextFunction): void {
  const secret = config.chatwoot.webhookSecret;

  if (!secret) {
    logger.error('Chatwoot webhook authentication unavailable');
    res.status(503).json({ success: false, error: 'Webhook authentication unavailable' });
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

  const timestamp = req.header('x-chatwoot-timestamp');
  if (!timestamp || !isTimestampFresh(timestamp)) {
    logger.warn('Chatwoot webhook timestamp invalid or expired');
    res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    return;
  }

  const expected = computeChatwootSignature(rawBody, secret, timestamp);
  const actual = normalizeSignature(signature);

  if (!safeCompareHex(expected, actual)) {
    logger.warn('Chatwoot webhook signature invalid');
    res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    return;
  }

  const source = validateChatwootSource(req.body, {
    accountId: config.chatwoot.accountId,
    inboxIds: config.chatwoot.inboxIds,
  });
  if (!source.valid) {
    logger.warn('Chatwoot webhook source rejected', { reason: source.reason });
    res.status(403).json({ success: false, error: 'Webhook source not allowed' });
    return;
  }

  next();
}
