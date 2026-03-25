"use strict";
// Telegram Ingestion Tools for Agent
// Phase 5: Tools for ingesting Telegram content
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramIngestionTools = void 0;
exports.ingestTelegramContent = ingestTelegramContent;
exports.approveContent = approveContent;
exports.rejectContent = rejectContent;
exports.previewClassification = previewClassification;
exports.listPendingContent = listPendingContent;
const index_1 = require("../logging/index");
const service_1 = require("./service");
const classifier_1 = require("./classifier");
/**
 * Tool: ingest_telegram_content
 * Processes content sent via Telegram for knowledge base ingestion
 */
async function ingestTelegramContent(input) {
    try {
        index_1.logger.info('Tool ingest_telegram_content called', {
            contentLength: input.content?.length,
            source: input.source,
            classification: input.classification,
        });
        // Validate input
        if (!input.content || input.content.trim().length === 0) {
            throw new Error('Content is required');
        }
        // If classification provided, skip auto-classification
        let result;
        if (input.classification) {
            // Use provided classification - process directly
            // This path is for when admin wants to force a specific type
            result = await service_1.telegramIngestionService.receiveContent({
                rawContent: input.content,
                source: input.source || 'manual',
                title: input.title,
            });
        }
        else {
            // Auto-classify content
            result = await service_1.telegramIngestionService.receiveContent({
                rawContent: input.content,
                source: input.source || 'manual',
                title: input.title,
            });
        }
        // Get classification details for response
        const classification = service_1.telegramIngestionService.classifyContent(input.content, input.title);
        index_1.logger.info('Tool ingest_telegram_content completed', {
            ingestionId: result.ingestionId,
            status: result.status,
            success: result.success,
        });
        return {
            success: result.success,
            ingestionId: result.ingestionId,
            status: result.status,
            message: result.message,
            classification: {
                type: classification.type,
                confidence: classification.confidence,
                title: classification.title,
            },
            destination: result.success ? 'pending_review' : undefined,
            knowledgeDocumentId: result.knowledgeDocumentId,
        };
    }
    catch (error) {
        index_1.logger.error('Tool ingest_telegram_content failed', error, {
            input: { contentLength: input.content?.length },
        });
        return {
            success: false,
            ingestionId: '',
            status: 'failed',
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
/**
 * Tool: approve_content
 * Approves content for publishing to knowledge base
 */
async function approveContent(ingestionId, approvedBy) {
    try {
        index_1.logger.info('Tool approve_content called', {
            ingestionId,
            approvedBy,
        });
        const result = await service_1.telegramIngestionService.approveIngestion(ingestionId, approvedBy);
        return {
            success: result.success,
            message: result.message,
            knowledgeDocumentId: result.knowledgeDocumentId,
        };
    }
    catch (error) {
        index_1.logger.error('Tool approve_content failed', error, {
            ingestionId,
        });
        return {
            success: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
/**
 * Tool: reject_content
 * Rejects content from being published
 */
async function rejectContent(ingestionId, rejectedBy, reason) {
    try {
        index_1.logger.info('Tool reject_content called', {
            ingestionId,
            rejectedBy,
            reason,
        });
        const result = await service_1.telegramIngestionService.rejectIngestion(ingestionId, rejectedBy, reason);
        return {
            success: result.success,
            message: result.message,
        };
    }
    catch (error) {
        index_1.logger.error('Tool reject_content failed', error, {
            ingestionId,
        });
        return {
            success: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
/**
 * Tool: preview_classification
 * Previews how content would be classified without creating ingestion
 */
function previewClassification(content, title) {
    const classification = service_1.telegramIngestionService.classifyContent(content, title);
    const routing = classifier_1.classifierService.getRouting(classification.type);
    return {
        type: classification.type,
        confidence: classification.confidence,
        title: classification.title,
        tags: classification.tags,
        destination: routing.destination,
        requiresApproval: routing.requiresApproval,
    };
}
/**
 * Tool: list_pending_content
 * Lists content awaiting approval
 */
async function listPendingContent(limit = 50) {
    try {
        const pending = await service_1.telegramIngestionService.getPendingIngestions(limit);
        return {
            success: true,
            count: pending.length,
            ingestions: pending.map(i => ({
                id: i.id,
                title: i.title || 'Untitled',
                type: i.classifiedType,
                source: i.source,
                createdAt: i.createdAt.toISOString(),
            })),
        };
    }
    catch (error) {
        index_1.logger.error('Tool list_pending_content failed', error);
        return {
            success: false,
            count: 0,
            ingestions: [],
        };
    }
}
/**
 * Export all telegram ingestion tools
 */
exports.telegramIngestionTools = {
    ingest_telegram_content: ingestTelegramContent,
    approve_content: approveContent,
    reject_content: rejectContent,
    preview_classification: previewClassification,
    list_pending_content: listPendingContent,
};
//# sourceMappingURL=tools.js.map