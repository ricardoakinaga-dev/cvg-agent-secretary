import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { logger } from '../logging';
import { metrics, METRICS } from '../../shared/metrics';
import { PrivacyLifecycleService, PrivacyOperationError } from './service';

type PrivacyOperations = Pick<
  PrivacyLifecycleService,
  'previewRetention' | 'purgeRetention' | 'exportSubject' | 'anonymizeSubject' | 'eraseSubject'
>;

type TenantResolver = (request: Request) => string;

const idempotencyKey = z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9._:-]+$/);
const operationBody = z.object({ idempotencyKey }).strict();
const destructiveBody = operationBody.extend({ confirm: z.literal(true) }).strict();
const destructiveSubjectBody = destructiveBody.extend({
  recoveryCheckpointId: z.string().trim().min(8).max(200).regex(/^[a-zA-Z0-9._:-]+$/),
}).strict();
const purgeBody = destructiveBody.extend({
  approvedPreviewReceiptId: z.string().trim().min(1).max(200),
  recoveryCheckpointId: z.string().trim().min(8).max(200).regex(/^[a-zA-Z0-9._:-]+$/),
}).strict();
const subjectParams = z.object({ contactId: z.string().uuid() }).strict();

function actorId(request: Request): string {
  const parsed = z.string().trim().min(1).max(200).safeParse(request.user?.id);
  if (!parsed.success) {
    throw new PrivacyOperationError('Authenticated actor is required', 'PRIVACY_ACTOR_REQUIRED');
  }
  return parsed.data;
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

function statusFor(error: PrivacyOperationError): number {
  if (error.code === 'PRIVACY_REQUEST_INVALID' || error.code === 'PRIVACY_ACTOR_REQUIRED') {
    return 400;
  }
  if (
    error.code === 'PRIVACY_PREVIEW_REQUIRED'
    || error.code === 'PRIVACY_PREVIEW_STALE'
    || error.code === 'PRIVACY_IDEMPOTENCY_CONFLICT'
    || error.code === 'PRIVACY_EXPORT_REPLAY'
  ) {
    return 409;
  }
  return 503;
}

async function measured<T>(kind: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    metrics.incrementCounter(METRICS.PRIVACY_OPERATIONS_TOTAL, { kind, status: 'completed' });
    return result;
  } catch (error) {
    metrics.incrementCounter(METRICS.PRIVACY_OPERATIONS_TOTAL, { kind, status: 'failed' });
    metrics.incrementCounter(METRICS.PRIVACY_OPERATIONS_ERRORS, { kind });
    throw error;
  } finally {
    metrics.recordHistogram(METRICS.PRIVACY_OPERATIONS_LATENCY, Date.now() - startedAt, { kind });
  }
}

export function createPrivacyRouter(
  service: PrivacyOperations,
  resolveTenantId: TenantResolver
): Router {
  const router = Router();

  router.post('/retention/preview', requirePermission('privacy:read'), asyncRoute(async (req, res) => {
    const body = operationBody.parse(req.body);
    const result = await measured('retention_preview', () => service.previewRetention({
      tenantId: resolveTenantId(req),
      actorId: actorId(req),
      idempotencyKey: body.idempotencyKey,
    }));
    res.json(result);
  }));

  router.post('/retention/purge', requirePermission('privacy:delete'), asyncRoute(async (req, res) => {
    const body = purgeBody.parse(req.body);
    const result = await measured('retention_purge', () => service.purgeRetention({
      tenantId: resolveTenantId(req),
      actorId: actorId(req),
      idempotencyKey: body.idempotencyKey,
      approvedPreviewReceiptId: body.approvedPreviewReceiptId,
      recoveryCheckpointId: body.recoveryCheckpointId,
      confirm: body.confirm,
    }));
    res.json(result);
  }));

  router.post('/subjects/:contactId/export', requirePermission('privacy:read'), asyncRoute(async (req, res) => {
    const body = operationBody.parse(req.body);
    const params = subjectParams.parse(req.params);
    const result = await measured('subject_export', () => service.exportSubject({
      tenantId: resolveTenantId(req),
      actorId: actorId(req),
      idempotencyKey: body.idempotencyKey,
      contactId: params.contactId,
    }));
    res.json(result);
  }));

  router.post('/subjects/:contactId/anonymize', requirePermission('privacy:delete'), asyncRoute(async (req, res) => {
    const body = destructiveSubjectBody.parse(req.body);
    const params = subjectParams.parse(req.params);
    const result = await measured('subject_anonymize', () => service.anonymizeSubject({
      tenantId: resolveTenantId(req),
      actorId: actorId(req),
      idempotencyKey: body.idempotencyKey,
      contactId: params.contactId,
      confirm: body.confirm,
      recoveryCheckpointId: body.recoveryCheckpointId,
    }));
    res.json(result);
  }));

  router.post('/subjects/:contactId/erase', requirePermission('privacy:delete'), asyncRoute(async (req, res) => {
    const body = destructiveSubjectBody.parse(req.body);
    const params = subjectParams.parse(req.params);
    const result = await measured('subject_erase', () => service.eraseSubject({
      tenantId: resolveTenantId(req),
      actorId: actorId(req),
      idempotencyKey: body.idempotencyKey,
      contactId: params.contactId,
      confirm: body.confirm,
      recoveryCheckpointId: body.recoveryCheckpointId,
    }));
    res.json(result);
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid privacy request', code: 'PRIVACY_REQUEST_INVALID' });
      return;
    }
    if (error instanceof PrivacyOperationError) {
      logger.warn('Privacy API operation failed', { code: error.code });
      res.status(statusFor(error)).json({ error: 'Privacy operation failed', code: error.code });
      return;
    }
    logger.error('Unexpected privacy API failure');
    res.status(500).json({ error: 'Privacy operation failed', code: 'PRIVACY_INTERNAL_ERROR' });
  });

  return router;
}
