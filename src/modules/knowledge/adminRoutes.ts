import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { logger } from '../logging';
import { knowledgeRepository } from './repository';
import { KnowledgeCategory, KnowledgeDocumentStatus } from './types';

const router = Router();

const categorySchema = z.enum(['faq', 'policy', 'procedure', 'service', 'orientation']);
const statusSchema = z.enum(['draft', 'pending_review', 'approved', 'published', 'rejected']);

const createDocumentSchema = z.object({
  title: z.string().min(3).max(500),
  content: z.string().min(10),
  category: categorySchema,
  source: z.enum(['telegram', 'manual', 'imported']).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdBy: z.string().min(1).optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().min(3).max(500).optional(),
  content: z.string().min(10).optional(),
  category: categorySchema.optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const actorSchema = z.object({
  actor: z.string().min(1).optional(),
});

const rejectDocumentSchema = actorSchema.extend({
  reason: z.string().min(3).max(1000).optional(),
});

function parseLimit(value: unknown): number {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), 100);
}

router.get(
  '/documents',
  requirePermission('knowledge:read'),
  async (req: Request, res: Response) => {
    try {
      const status = req.query.status ? statusSchema.parse(req.query.status) : undefined;
      const category = req.query.category ? categorySchema.parse(req.query.category) : undefined;
      const documents = await knowledgeRepository.listDocuments({
        status: status as KnowledgeDocumentStatus | undefined,
        category: category as KnowledgeCategory | undefined,
        limit: parseLimit(req.query.limit),
      });

      res.json({ documents, count: documents.length });
    } catch (error) {
      logger.error('Knowledge list failed', error as Error);
      res.status(400).json({ success: false, error: 'Invalid knowledge list request' });
    }
  }
);

router.post(
  '/documents',
  requirePermission('knowledge:write'),
  async (req: Request, res: Response) => {
    try {
      const input = createDocumentSchema.parse(req.body);
      const document = await knowledgeRepository.createDocument(input);
      res.status(201).json({ document });
    } catch (error) {
      logger.error('Knowledge create failed', error as Error);
      res.status(400).json({ success: false, error: 'Invalid knowledge document' });
    }
  }
);

router.patch(
  '/documents/:id',
  requirePermission('knowledge:write'),
  async (req: Request, res: Response) => {
    try {
      const input = updateDocumentSchema.parse(req.body);
      const document = await knowledgeRepository.updateDocument({
        id: req.params.id,
        ...input,
      });
      res.json({ document });
    } catch (error) {
      logger.error('Knowledge update failed', error as Error, { documentId: req.params.id });
      res.status(400).json({ success: false, error: 'Invalid knowledge update' });
    }
  }
);

router.post(
  '/documents/:id/submit-review',
  requirePermission('knowledge:write'),
  async (req: Request, res: Response) => {
    try {
      const document = await knowledgeRepository.submitForReview(req.params.id);
      res.json({ document });
    } catch (error) {
      logger.error('Knowledge submit review failed', error as Error, { documentId: req.params.id });
      res.status(400).json({ success: false, error: 'Could not submit knowledge document for review' });
    }
  }
);

router.post(
  '/documents/:id/approve',
  requirePermission('knowledge:approve'),
  async (req: Request, res: Response) => {
    try {
      const input = actorSchema.parse(req.body || {});
      const approvedBy = z.string().min(1).parse(input.actor || req.user?.id);
      const document = await knowledgeRepository.approveDocument(req.params.id, approvedBy);
      res.json({ document });
    } catch (error) {
      logger.error('Knowledge approve failed', error as Error, { documentId: req.params.id });
      res.status(400).json({ success: false, error: 'Could not approve knowledge document' });
    }
  }
);

router.post(
  '/documents/:id/reject',
  requirePermission('knowledge:approve'),
  async (req: Request, res: Response) => {
    try {
      const input = rejectDocumentSchema.parse(req.body || {});
      const rejectedBy = z.string().min(1).parse(input.actor || req.user?.id);
      const document = await knowledgeRepository.rejectDocument(req.params.id, rejectedBy, input.reason);
      res.json({ document });
    } catch (error) {
      logger.error('Knowledge reject failed', error as Error, { documentId: req.params.id });
      res.status(400).json({ success: false, error: 'Could not reject knowledge document' });
    }
  }
);

router.post(
  '/documents/:id/publish',
  requirePermission('knowledge:publish'),
  async (req: Request, res: Response) => {
    try {
      const approvedBy = z.string().min(1).parse(req.body?.approvedBy || req.user?.id);
      const document = await knowledgeRepository.publishDocument(req.params.id, approvedBy);
      res.json({ document });
    } catch (error) {
      logger.error('Knowledge publish failed', error as Error, { documentId: req.params.id });
      res.status(400).json({ success: false, error: 'Could not publish knowledge document' });
    }
  }
);

export const knowledgeAdminRouter = router;
