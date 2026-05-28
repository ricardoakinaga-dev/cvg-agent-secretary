import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { logger } from '../logging';
import { schedulingRepository } from './repository';

const router = Router();

const uuidSchema = z.string().uuid();
const slotStatusSchema = z.enum(['available', 'reserved', 'booked', 'blocked']);

const createServiceSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  requiresHumanApproval: z.boolean().optional(),
});

const createProviderSchema = z.object({
  name: z.string().min(2).max(255),
  sector: z.string().min(2).max(100).optional(),
});

const createSlotSchema = z.object({
  serviceId: uuidSchema.optional(),
  providerId: uuidSchema.optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  status: slotStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine((input) => input.endsAt > input.startsAt, {
  message: 'endsAt must be after startsAt',
  path: ['endsAt'],
});

const listSlotsSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  serviceId: uuidSchema.optional(),
  providerId: uuidSchema.optional(),
  status: slotStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
}).refine((input) => {
  if (!input.from || !input.to) return true;
  return input.to > input.from;
}, {
  message: 'to must be after from',
  path: ['to'],
});

function defaultSlotWindow(): { from: Date; to: Date } {
  const from = new Date();
  const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

router.get(
  '/services',
  requirePermission('scheduling:read'),
  async (_req: Request, res: Response) => {
    try {
      const services = await schedulingRepository.listServices();
      res.json({ services, count: services.length });
    } catch (error) {
      logger.error('Scheduling services list failed', error as Error);
      res.status(500).json({ success: false, error: 'Could not list appointment services' });
    }
  }
);

router.post(
  '/services',
  requirePermission('scheduling:write'),
  async (req: Request, res: Response) => {
    try {
      const input = createServiceSchema.parse(req.body);
      const service = await schedulingRepository.createService(input);
      res.status(201).json({ service });
    } catch (error) {
      logger.error('Scheduling service create failed', error as Error);
      res.status(400).json({ success: false, error: 'Invalid appointment service' });
    }
  }
);

router.get(
  '/providers',
  requirePermission('scheduling:read'),
  async (_req: Request, res: Response) => {
    try {
      const providers = await schedulingRepository.listProviders();
      res.json({ providers, count: providers.length });
    } catch (error) {
      logger.error('Scheduling providers list failed', error as Error);
      res.status(500).json({ success: false, error: 'Could not list appointment providers' });
    }
  }
);

router.post(
  '/providers',
  requirePermission('scheduling:write'),
  async (req: Request, res: Response) => {
    try {
      const input = createProviderSchema.parse(req.body);
      const provider = await schedulingRepository.createProvider(input);
      res.status(201).json({ provider });
    } catch (error) {
      logger.error('Scheduling provider create failed', error as Error);
      res.status(400).json({ success: false, error: 'Invalid appointment provider' });
    }
  }
);

router.get(
  '/slots',
  requirePermission('scheduling:read'),
  async (req: Request, res: Response) => {
    try {
      const window = defaultSlotWindow();
      const input = listSlotsSchema.parse({
        ...req.query,
        from: req.query.from || window.from,
        to: req.query.to || window.to,
      });
      const slots = await schedulingRepository.listSlots({
        from: input.from || window.from,
        to: input.to || window.to,
        serviceId: input.serviceId,
        providerId: input.providerId,
        status: input.status,
        limit: input.limit,
      });
      res.json({ slots, count: slots.length });
    } catch (error) {
      logger.error('Scheduling slots list failed', error as Error);
      res.status(400).json({ success: false, error: 'Invalid appointment slot list request' });
    }
  }
);

router.post(
  '/slots',
  requirePermission('scheduling:write'),
  async (req: Request, res: Response) => {
    try {
      const input = createSlotSchema.parse(req.body);
      const slot = await schedulingRepository.createSlot(input);
      res.status(201).json({ slot });
    } catch (error) {
      logger.error('Scheduling slot create failed', error as Error);
      res.status(400).json({ success: false, error: 'Invalid appointment slot' });
    }
  }
);

export const schedulingAdminRouter = router;
