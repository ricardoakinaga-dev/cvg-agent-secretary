import { createHash } from 'node:crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { auditService, createAuthenticatedAuditPrincipal } from '../audit/service';
import { logger } from '../logging';
import { maskSensitiveData } from '../../shared/data-masking';
import { chatwootWebhookWorker } from './worker';

const router = Router();
const uuidSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(3).max(500);

function parseLimit(value: unknown): number {
  const parsed = Number(value || 100);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 500) : 100;
}

function principal(req: Request) {
  return createAuthenticatedAuditPrincipal(req.user, req.header('x-correlation-id'));
}

function reasonHash(reason: string): string {
  return createHash('sha256').update(reason).digest('hex');
}

router.get(
  '/dead-letter',
  requirePermission('webhooks:replay'),
  async (req: Request, res: Response) => {
    try {
      const receipts = await chatwootWebhookWorker.listDeadLetters(parseLimit(req.query.limit));
      res.json({
        receipts: receipts.map((receipt) => ({
          id: receipt.id,
          deliveryId: receipt.deliveryId,
          correlationId: receipt.correlationId,
          eventType: receipt.eventType,
          chatwootConversationId: receipt.chatwootConversationId,
          chatwootMessageId: receipt.chatwootMessageId,
          status: receipt.status,
          attempts: receipt.attempts,
          lastActor: receipt.lastActor,
          lastError: receipt.lastError ? maskSensitiveData(receipt.lastError) : null,
          createdAt: receipt.createdAt,
          updatedAt: receipt.updatedAt,
        })),
        count: receipts.length,
      });
    } catch (error) {
      logger.error('Webhook dead-letter listing failed', error as Error);
      res.status(503).json({ success: false, error: 'Dead-letter queue unavailable' });
    }
  }
);

router.post(
  '/dead-letter/:id/replay',
  requirePermission('webhooks:replay'),
  async (req: Request, res: Response) => {
    try {
      const receiptId = uuidSchema.parse(req.params.id);
      const reason = reasonSchema.parse(req.body?.reason);
      const actor = principal(req);
      const job = await chatwootWebhookWorker.replayDeadLetter(receiptId, `operator:${actor.id}`);
      await auditService.recordEvent({
        eventType: 'user_action',
        actor: actor.id,
        actorRole: actor.role,
        actorSource: actor.source,
        resourceType: 'webhook_dead_letter',
        resourceId: receiptId,
        action: 'replay',
        details: { outcome: 'queued', status: 'replayed', reasonHash: reasonHash(reason) },
        correlationId: actor.correlationId,
        idempotencyKey: req.header('x-idempotency-key') || `webhook:replay:${receiptId}`,
      });
      res.status(202).json({ success: true, queued: true, jobId: job.id });
    } catch (error) {
      logger.error('Webhook dead-letter replay failed', error as Error);
      res.status(400).json({ success: false, error: 'Dead-letter replay failed' });
    }
  }
);

router.post(
  '/dead-letter/:id/cancel',
  requirePermission('webhooks:replay'),
  async (req: Request, res: Response) => {
    try {
      const receiptId = uuidSchema.parse(req.params.id);
      const reason = reasonSchema.parse(req.body?.reason);
      const actor = principal(req);
      await chatwootWebhookWorker.cancelDeadLetter(receiptId, reason, `operator:${actor.id}`);
      await auditService.recordEvent({
        eventType: 'user_action',
        actor: actor.id,
        actorRole: actor.role,
        actorSource: actor.source,
        resourceType: 'webhook_dead_letter',
        resourceId: receiptId,
        action: 'cancel',
        details: { outcome: 'cancelled', status: 'dead_letter', reasonHash: reasonHash(reason) },
        correlationId: actor.correlationId,
        idempotencyKey: req.header('x-idempotency-key') || `webhook:cancel:${receiptId}`,
      });
      res.json({ success: true, cancelled: true });
    } catch (error) {
      logger.error('Webhook dead-letter cancellation failed', error as Error);
      res.status(400).json({ success: false, error: 'Dead-letter cancellation failed' });
    }
  }
);

export const webhookAdminRouter = router;
