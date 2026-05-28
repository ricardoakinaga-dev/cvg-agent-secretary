"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulingAdminRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../../middleware/auth");
const logging_1 = require("../logging");
const repository_1 = require("./repository");
const router = (0, express_1.Router)();
const uuidSchema = zod_1.z.string().uuid();
const slotStatusSchema = zod_1.z.enum(['available', 'reserved', 'booked', 'blocked']);
const createServiceSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(255),
    description: zod_1.z.string().max(2000).optional(),
    durationMinutes: zod_1.z.number().int().min(5).max(480).optional(),
    requiresHumanApproval: zod_1.z.boolean().optional(),
});
const createProviderSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(255),
    sector: zod_1.z.string().min(2).max(100).optional(),
});
const createSlotSchema = zod_1.z.object({
    serviceId: uuidSchema.optional(),
    providerId: uuidSchema.optional(),
    startsAt: zod_1.z.coerce.date(),
    endsAt: zod_1.z.coerce.date(),
    status: slotStatusSchema.optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
}).refine((input) => input.endsAt > input.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
});
const listSlotsSchema = zod_1.z.object({
    from: zod_1.z.coerce.date().optional(),
    to: zod_1.z.coerce.date().optional(),
    serviceId: uuidSchema.optional(),
    providerId: uuidSchema.optional(),
    status: slotStatusSchema.optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(500).optional(),
}).refine((input) => {
    if (!input.from || !input.to)
        return true;
    return input.to > input.from;
}, {
    message: 'to must be after from',
    path: ['to'],
});
function defaultSlotWindow() {
    const from = new Date();
    const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
    return { from, to };
}
router.get('/services', (0, auth_1.requirePermission)('scheduling:read'), async (_req, res) => {
    try {
        const services = await repository_1.schedulingRepository.listServices();
        res.json({ services, count: services.length });
    }
    catch (error) {
        logging_1.logger.error('Scheduling services list failed', error);
        res.status(500).json({ success: false, error: 'Could not list appointment services' });
    }
});
router.post('/services', (0, auth_1.requirePermission)('scheduling:write'), async (req, res) => {
    try {
        const input = createServiceSchema.parse(req.body);
        const service = await repository_1.schedulingRepository.createService(input);
        res.status(201).json({ service });
    }
    catch (error) {
        logging_1.logger.error('Scheduling service create failed', error);
        res.status(400).json({ success: false, error: 'Invalid appointment service' });
    }
});
router.get('/providers', (0, auth_1.requirePermission)('scheduling:read'), async (_req, res) => {
    try {
        const providers = await repository_1.schedulingRepository.listProviders();
        res.json({ providers, count: providers.length });
    }
    catch (error) {
        logging_1.logger.error('Scheduling providers list failed', error);
        res.status(500).json({ success: false, error: 'Could not list appointment providers' });
    }
});
router.post('/providers', (0, auth_1.requirePermission)('scheduling:write'), async (req, res) => {
    try {
        const input = createProviderSchema.parse(req.body);
        const provider = await repository_1.schedulingRepository.createProvider(input);
        res.status(201).json({ provider });
    }
    catch (error) {
        logging_1.logger.error('Scheduling provider create failed', error);
        res.status(400).json({ success: false, error: 'Invalid appointment provider' });
    }
});
router.get('/slots', (0, auth_1.requirePermission)('scheduling:read'), async (req, res) => {
    try {
        const window = defaultSlotWindow();
        const input = listSlotsSchema.parse({
            ...req.query,
            from: req.query.from || window.from,
            to: req.query.to || window.to,
        });
        const slots = await repository_1.schedulingRepository.listSlots({
            from: input.from || window.from,
            to: input.to || window.to,
            serviceId: input.serviceId,
            providerId: input.providerId,
            status: input.status,
            limit: input.limit,
        });
        res.json({ slots, count: slots.length });
    }
    catch (error) {
        logging_1.logger.error('Scheduling slots list failed', error);
        res.status(400).json({ success: false, error: 'Invalid appointment slot list request' });
    }
});
router.post('/slots', (0, auth_1.requirePermission)('scheduling:write'), async (req, res) => {
    try {
        const input = createSlotSchema.parse(req.body);
        const slot = await repository_1.schedulingRepository.createSlot(input);
        res.status(201).json({ slot });
    }
    catch (error) {
        logging_1.logger.error('Scheduling slot create failed', error);
        res.status(400).json({ success: false, error: 'Invalid appointment slot' });
    }
});
exports.schedulingAdminRouter = router;
//# sourceMappingURL=adminRoutes.js.map