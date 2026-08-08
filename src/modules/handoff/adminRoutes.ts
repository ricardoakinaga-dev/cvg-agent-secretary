import { createHash } from 'node:crypto';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { auditService, createAuthenticatedAuditPrincipal } from '../audit/service';
import { logger } from '../logging';
import { handoffRepository } from './repository';
import { resolveHandoffControl } from './controlService';

const router = Router();
const conversationIdSchema = z.string().uuid();
const resolutionSchema = z.object({
  action: z.enum(['resume', 'complete', 'cancel']),
  reason: z.string().trim().min(3).max(500),
});

function reasonHash(reason: string): string {
  return createHash('sha256').update(reason).digest('hex');
}

router.get(
  '/:conversationId/handoff',
  requirePermission('conversations:read'),
  async (req: Request, res: Response) => {
    try {
      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const handoff = await handoffRepository.findByConversation(conversationId);
      if (!handoff) {
        res.status(404).json({ success: false, error: 'Handoff not found' });
        return;
      }
      res.json({
        handoff: {
          id: handoff.id,
          conversationId: handoff.conversationId,
          triggerType: handoff.triggerType,
          status: handoff.status,
          priority: handoff.priority,
          summary: handoff.summary,
          pendingQuestions: handoff.pendingQuestions,
          riskLevel: handoff.riskLevel,
          createdAt: handoff.createdAt,
          completedAt: handoff.completedAt,
          resolvedBy: handoff.resolvedBy,
        },
      });
    } catch (error) {
      logger.error('Handoff lookup failed', error as Error);
      res.status(400).json({ success: false, error: 'Invalid handoff lookup request' });
    }
  }
);

router.post(
  '/:conversationId/handoff/resolve',
  requirePermission('conversations:write'),
  async (req: Request, res: Response) => {
    try {
      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const input = resolutionSchema.parse(req.body);
      const principal = createAuthenticatedAuditPrincipal(
        req.user,
        req.header('x-correlation-id')
      );
      const result = await resolveHandoffControl({
        conversationId,
        ...input,
        actorId: principal.id,
      });

      await auditService.recordEvent({
        eventType: 'user_action',
        actor: principal.id,
        actorRole: principal.role,
        actorSource: principal.source,
        resourceType: 'conversation_handoff',
        resourceId: conversationId,
        action: `handoff_${input.action}`,
        details: {
          handoffId: result.handoffId,
          status: result.controlState,
          version: result.controlVersion,
          reasonHash: reasonHash(input.reason),
        },
        correlationId: principal.correlationId,
        idempotencyKey: req.header('x-idempotency-key')
          || `handoff:${conversationId}:${input.action}:${reasonHash(input.reason)}`,
      });

      res.json({ success: true, result });
    } catch (error) {
      logger.error('Handoff resolution failed', error as Error);
      const message = error instanceof z.ZodError
        ? 'Invalid handoff resolution request'
        : error instanceof Error && error.message === 'Conversation not found'
          ? 'Conversation not found'
          : error instanceof Error && error.message === 'Conversation is not awaiting handoff resolution'
            ? error.message
            : 'Handoff resolution unavailable';
      const status = message === 'Conversation not found' ? 404 : message === 'Handoff resolution unavailable' ? 503 : 400;
      res.status(status).json({ success: false, error: message });
    }
  }
);

export const handoffAdminRouter = router;
