import { createHash } from 'node:crypto';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { auditService, createAuthenticatedAuditPrincipal } from '../audit/service';
import { logger } from '../logging';
import {
  toolExecutionRepository,
  type ToolReconciliationAction,
} from './executionRepository';

const router = Router();
const uuidSchema = z.string().uuid();
const reconciliationSchema = z.object({
  action: z.enum(['confirm', 'retry']),
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
  requirePermission('tools:reconcile'),
  async (req: Request, res: Response) => {
    try {
      const executions = await toolExecutionRepository.listReconciliationCandidates(parseLimit(req.query.limit));
      res.json({ executions, count: executions.length });
    } catch (error) {
      logger.error('Tool reconciliation listing failed', error as Error);
      res.status(503).json({ success: false, error: 'Tool reconciliation unavailable' });
    }
  }
);

router.post(
  '/reconciliation/:id',
  requirePermission('tools:reconcile'),
  async (req: Request, res: Response) => {
    try {
      const id = uuidSchema.parse(req.params.id);
      const input = reconciliationSchema.parse(req.body);
      const principal = createAuthenticatedAuditPrincipal(
        req.user,
        req.header('x-correlation-id')
      );
      const execution = await toolExecutionRepository.reconcile(
        id,
        input.action as ToolReconciliationAction,
        principal.id,
        input.reason
      );
      await auditService.recordEvent({
        eventType: 'user_action',
        actor: principal.id,
        actorRole: principal.role,
        actorSource: principal.source,
        resourceType: 'tool_execution',
        resourceId: id,
        action: `tool_reconcile_${input.action}`,
        details: {
          outcome: execution.status,
          status: execution.status,
          reasonHash: reasonHash(input.reason),
        },
        correlationId: principal.correlationId,
        idempotencyKey: req.header('x-idempotency-key')
          || `tool-reconcile:${id}:${input.action}:${reasonHash(input.reason)}`,
      });
      res.json({ success: true, execution });
    } catch (error) {
      logger.error('Tool reconciliation failed', error as Error);
      const status = error instanceof z.ZodError ? 400 : 503;
      res.status(status).json({
        success: false,
        error: status === 400 ? 'Invalid tool reconciliation request' : 'Tool reconciliation unavailable',
      });
    }
  }
);

export const agentToolsAdminRouter = router;
