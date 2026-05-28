"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeAdminRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../../middleware/auth");
const logging_1 = require("../logging");
const repository_1 = require("./repository");
const router = (0, express_1.Router)();
const categorySchema = zod_1.z.enum(['faq', 'policy', 'procedure', 'service', 'orientation']);
const statusSchema = zod_1.z.enum(['draft', 'pending_review', 'approved', 'published', 'rejected']);
const createDocumentSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).max(500),
    content: zod_1.z.string().min(10),
    category: categorySchema,
    source: zod_1.z.enum(['telegram', 'manual', 'imported']).optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
    createdBy: zod_1.z.string().min(1).optional(),
});
const updateDocumentSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).max(500).optional(),
    content: zod_1.z.string().min(10).optional(),
    category: categorySchema.optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const actorSchema = zod_1.z.object({
    actor: zod_1.z.string().min(1).optional(),
});
const rejectDocumentSchema = actorSchema.extend({
    reason: zod_1.z.string().min(3).max(1000).optional(),
});
function parseLimit(value) {
    const parsed = Number(value || 50);
    if (!Number.isFinite(parsed))
        return 50;
    return Math.min(Math.max(parsed, 1), 100);
}
router.get('/documents', (0, auth_1.requirePermission)('knowledge:read'), async (req, res) => {
    try {
        const status = req.query.status ? statusSchema.parse(req.query.status) : undefined;
        const category = req.query.category ? categorySchema.parse(req.query.category) : undefined;
        const documents = await repository_1.knowledgeRepository.listDocuments({
            status: status,
            category: category,
            limit: parseLimit(req.query.limit),
        });
        res.json({ documents, count: documents.length });
    }
    catch (error) {
        logging_1.logger.error('Knowledge list failed', error);
        res.status(400).json({ success: false, error: 'Invalid knowledge list request' });
    }
});
router.post('/documents', (0, auth_1.requirePermission)('knowledge:write'), async (req, res) => {
    try {
        const input = createDocumentSchema.parse(req.body);
        const document = await repository_1.knowledgeRepository.createDocument(input);
        res.status(201).json({ document });
    }
    catch (error) {
        logging_1.logger.error('Knowledge create failed', error);
        res.status(400).json({ success: false, error: 'Invalid knowledge document' });
    }
});
router.patch('/documents/:id', (0, auth_1.requirePermission)('knowledge:write'), async (req, res) => {
    try {
        const input = updateDocumentSchema.parse(req.body);
        const document = await repository_1.knowledgeRepository.updateDocument({
            id: req.params.id,
            ...input,
        });
        res.json({ document });
    }
    catch (error) {
        logging_1.logger.error('Knowledge update failed', error, { documentId: req.params.id });
        res.status(400).json({ success: false, error: 'Invalid knowledge update' });
    }
});
router.post('/documents/:id/submit-review', (0, auth_1.requirePermission)('knowledge:write'), async (req, res) => {
    try {
        const document = await repository_1.knowledgeRepository.submitForReview(req.params.id);
        res.json({ document });
    }
    catch (error) {
        logging_1.logger.error('Knowledge submit review failed', error, { documentId: req.params.id });
        res.status(400).json({ success: false, error: 'Could not submit knowledge document for review' });
    }
});
router.post('/documents/:id/approve', (0, auth_1.requirePermission)('knowledge:approve'), async (req, res) => {
    try {
        const input = actorSchema.parse(req.body || {});
        const approvedBy = zod_1.z.string().min(1).parse(input.actor || req.user?.id);
        const document = await repository_1.knowledgeRepository.approveDocument(req.params.id, approvedBy);
        res.json({ document });
    }
    catch (error) {
        logging_1.logger.error('Knowledge approve failed', error, { documentId: req.params.id });
        res.status(400).json({ success: false, error: 'Could not approve knowledge document' });
    }
});
router.post('/documents/:id/reject', (0, auth_1.requirePermission)('knowledge:approve'), async (req, res) => {
    try {
        const input = rejectDocumentSchema.parse(req.body || {});
        const rejectedBy = zod_1.z.string().min(1).parse(input.actor || req.user?.id);
        const document = await repository_1.knowledgeRepository.rejectDocument(req.params.id, rejectedBy, input.reason);
        res.json({ document });
    }
    catch (error) {
        logging_1.logger.error('Knowledge reject failed', error, { documentId: req.params.id });
        res.status(400).json({ success: false, error: 'Could not reject knowledge document' });
    }
});
router.post('/documents/:id/publish', (0, auth_1.requirePermission)('knowledge:publish'), async (req, res) => {
    try {
        const approvedBy = zod_1.z.string().min(1).parse(req.body?.approvedBy || req.user?.id);
        const document = await repository_1.knowledgeRepository.publishDocument(req.params.id, approvedBy);
        res.json({ document });
    }
    catch (error) {
        logging_1.logger.error('Knowledge publish failed', error, { documentId: req.params.id });
        res.status(400).json({ success: false, error: 'Could not publish knowledge document' });
    }
});
exports.knowledgeAdminRouter = router;
//# sourceMappingURL=adminRoutes.js.map