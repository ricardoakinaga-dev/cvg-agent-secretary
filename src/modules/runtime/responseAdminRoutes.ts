import { createHash } from 'node:crypto';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { maskSensitiveData } from '../../shared/data-masking';
import { auditService, createAuthenticatedAuditPrincipal } from '../audit/service';
import { chatwootClient } from '../chatwoot/client';
import { logger } from '../logging';
import { responseOutboxRepository } from './responseOutboxRepository';
import { config } from '../../config';

const router = Router();
const uuidSchema = z.string().uuid();
const confirmationSchema = z.object({
  chatwootMessageId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

function parseLimit(value: unknown): number {
  const parsed = Number(value || 50);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50;
}

function reasonHash(reason: string): string {
  return createHash('sha256').update(reason).digest('hex');
}

router.get(
  '/reconciliation',
  requirePermission('responses:reconcile'),
  async (req: Request, res: Response) => {
    try {
      const intents = await responseOutboxRepository.findUnknown(parseLimit(req.query.limit));
      res.json({
        intents: intents.map((intent) => ({
          id: intent.id,
          conversationId: intent.conversationId,
          chatwootConversationId: intent.chatwootConversationId,
          inboundChatwootMessageId: intent.inboundChatwootMessageId,
          correlationId: intent.correlationId,
          status: intent.status,
          attempts: intent.attempts,
          lastActor: intent.lastActor,
          lastError: intent.lastError ? maskSensitiveData(intent.lastError) : null,
          createdAt: intent.createdAt,
        })),
        count: intents.length,
      });
    } catch (error) {
      logger.error('Response reconciliation listing failed', error as Error);
      res.status(503).json({ success: false, error: 'Response reconciliation unavailable' });
    }
  }
);

router.post(
  '/reconciliation/:id/confirm',
  requirePermission('responses:reconcile'),
  async (req: Request, res: Response) => {
    try {
      const id = uuidSchema.parse(req.params.id);
      const input = confirmationSchema.parse(req.body);
      const principal = createAuthenticatedAuditPrincipal(req.user, req.header('x-correlation-id'));
      const intent = await responseOutboxRepository.getById(id);
      if (!intent || intent.status !== 'unknown') {
        res.status(404).json({ success: false, error: 'Unknown response intent not found' });
        return;
      }

      const external = await chatwootClient.findMessageById(
        intent.chatwootConversationId,
        input.chatwootMessageId
      );
      const isOutgoing = external?.message_type === 'outgoing' || external?.message_type === 1;
      const isPublic = external?.private !== true;
      const markerMatches = external?.content_attributes?.cvg_idempotency_key === intent.idempotencyKey;
      const contentFallbackMatches = config.chatwoot.allowContentReconciliationFallback
        && external?.content === intent.content;
      if (!external || !isOutgoing || !isPublic || (!markerMatches && !contentFallbackMatches)) {
        res.status(409).json({ success: false, error: 'Chatwoot message does not match the response intent' });
        return;
      }

      const reconciled = await responseOutboxRepository.markReconciled(
        intent.id,
        external.id,
        `operator:${principal.id}`
      );
      await auditService.recordEvent({
        eventType: 'user_action',
        actor: principal.id,
        actorRole: principal.role,
        actorSource: principal.source,
        resourceType: 'response_outbox',
        resourceId: intent.id,
        action: 'response_reconcile_confirm',
        details: {
          outcome: 'reconciled',
          status: reconciled.status,
          reasonHash: reasonHash(input.reason),
        },
        correlationId: principal.correlationId,
        idempotencyKey: req.header('x-idempotency-key')
          || `response-reconcile:${intent.id}:${external.id}`,
      });
      res.json({
        success: true,
        response: {
          id: reconciled.id,
          status: reconciled.status,
          chatwootMessageId: reconciled.chatwootMessageId,
        },
      });
    } catch (error) {
      logger.error('Response reconciliation confirmation failed', error as Error);
      const status = error instanceof z.ZodError ? 400 : 503;
      res.status(status).json({
        success: false,
        error: status === 400 ? 'Invalid response reconciliation request' : 'Response reconciliation unavailable',
      });
    }
  }
);

export const responseAdminRouter = router;
