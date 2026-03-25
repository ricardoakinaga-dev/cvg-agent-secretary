"use strict";
// Telegram Ingestion Service
// Phase 5: Main ingestion pipeline service
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramIngestionService = void 0;
const classifier_1 = require("./classifier");
const repository_1 = require("./repository");
const repository_2 = require("../knowledge/repository");
const logging_1 = require("../logging");
const service_1 = require("../audit/service");
/**
 * Telegram Ingestion Service
 * Orchestrates the complete ingestion pipeline
 */
class TelegramIngestionService {
    /**
     * Receive and process new content from Telegram
     * This is the main entry point for ingestion
     */
    async receiveContent(input) {
        const startTime = Date.now();
        try {
            logging_1.logger.info('Received telegram content', {
                source: input.source || 'telegram',
                contentLength: input.rawContent.length,
                telegramChatId: input.telegramChatId,
            });
            // Step 1: Create initial ingestion record
            const ingestion = await repository_1.telegramIngestionRepository.create(input);
            // Step 2: Validate content
            const validation = classifier_1.classifierService.validate(input.rawContent);
            if (!validation.isValid) {
                await repository_1.telegramIngestionRepository.updateStatus(ingestion.id, 'rejected', 'system', undefined, validation.errors);
                logging_1.logger.warn('Content rejected due to validation errors', {
                    ingestionId: ingestion.id,
                    errors: validation.errors,
                });
                return {
                    success: false,
                    ingestionId: ingestion.id,
                    status: 'rejected',
                    message: `Validation failed: ${validation.errors.join(', ')}`,
                };
            }
            // Step 3: Classify content
            const classification = classifier_1.classifierService.classify(input.rawContent, input.title);
            // Step 4: Get routing decision
            const routing = classifier_1.classifierService.getRouting(classification.type);
            // Handle commands - don't process as content
            if (classification.type === 'command') {
                await repository_1.telegramIngestionRepository.updateStatus(ingestion.id, 'rejected', 'system', undefined, ['Content is a command, not knowledge']);
                return {
                    success: false,
                    ingestionId: ingestion.id,
                    status: 'rejected',
                    message: 'Content is a command, not knowledge',
                };
            }
            // Step 5: Update ingestion with classification results
            await repository_1.telegramIngestionRepository.updateWithClassification(ingestion.id, classification.type, classification.confidence, classification.title, classification.tags, routing.destination, routing.targetTable, routing.initialStatus);
            // Step 6: Process based on destination
            let knowledgeDocumentId;
            let operationalRuleId;
            if (routing.destination !== 'rejected') {
                const processed = await this.processToDestination(ingestion.id, classification, input.rawContent, routing.destination, routing.targetTable, input.source || 'telegram');
                knowledgeDocumentId = processed.knowledgeDocumentId;
                operationalRuleId = processed.OperationalRuleId;
            }
            // Calculate processing time
            const duration = Date.now() - startTime;
            logging_1.logger.info('Content processed successfully', {
                ingestionId: ingestion.id,
                type: classification.type,
                destination: routing.destination,
                status: routing.initialStatus,
                duration,
            });
            return {
                success: true,
                ingestionId: ingestion.id,
                status: routing.initialStatus,
                message: `Content classified as ${classification.type} and routed to ${routing.destination}`,
                knowledgeDocumentId,
                operationalRuleId,
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logging_1.logger.error('Error processing telegram content', err, {
                input,
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
     * Process content to its destination (RAG or Postgres)
     */
    async processToDestination(ingestionId, classification, rawContent, destination, targetTable, source) {
        const result = {};
        // Map content type to knowledge category
        const categoryMap = {
            faq: 'faq',
            policy: 'policy',
            procedure: 'procedure',
            rule: 'policy',
            command: 'orientation',
            feedback: 'orientation',
            schedule: 'service',
            price: 'service',
            instruction: 'orientation',
        };
        // Process to RAG (knowledge_documents)
        if (destination === 'rag' || destination === 'both') {
            try {
                const doc = await repository_2.knowledgeRepository.createDocument({
                    title: classification.title,
                    content: rawContent,
                    category: categoryMap[classification.type],
                    source: source,
                    sourceId: ingestionId,
                    tags: classification.tags,
                    metadata: classification.extractedData || {},
                    createdBy: 'telegram-ingestion',
                });
                result.knowledgeDocumentId = doc.id;
                // Update ingestion with knowledge document reference
                await repository_1.telegramIngestionRepository.updateStatus(ingestionId, 'processed', 'system', doc.id);
                logging_1.logger.info('Created knowledge document', {
                    ingestionId,
                    documentId: doc.id,
                });
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                logging_1.logger.error('Failed to create knowledge document', err, {
                    ingestionId,
                });
            }
        }
        // Process to Postgres (operational_rules)
        if (destination === 'postgres' || destination === 'both') {
            try {
                const rule = await repository_1.telegramIngestionRepository.createOperationalRule({
                    name: classification.title,
                    ruleType: classification.type,
                    content: classification.extractedData || { content: rawContent },
                    source,
                    sourceId: ingestionId,
                    createdBy: 'telegram-ingestion',
                });
                result.OperationalRuleId = rule.id;
                logging_1.logger.info('Created operational rule', {
                    ingestionId,
                    ruleId: rule.id,
                });
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                logging_1.logger.error('Failed to create operational rule', err, {
                    ingestionId,
                });
            }
        }
        return result;
    }
    /**
     * Approve an ingestion for publishing
     */
    async approveIngestion(ingestionId, approvedBy) {
        try {
            // Get ingestion
            const ingestion = await repository_1.telegramIngestionRepository.getById(ingestionId);
            if (!ingestion) {
                return {
                    success: false,
                    ingestionId,
                    status: 'failed',
                    message: 'Ingestion not found',
                };
            }
            // Publish if knowledge document exists
            if (ingestion.knowledgeDocumentId) {
                await repository_2.knowledgeRepository.publishDocument(ingestion.knowledgeDocumentId, approvedBy);
                // Update ingestion status to published
                await repository_1.telegramIngestionRepository.updateStatus(ingestionId, 'published', approvedBy, ingestion.knowledgeDocumentId);
            }
            else {
                // No knowledge document, just approve
                await repository_1.telegramIngestionRepository.approve(ingestionId, approvedBy);
            }
            // Activate if operational rule was created
            // (would need to track the operational rule ID)
            logging_1.logger.info('Ingestion approved and published', {
                ingestionId,
                approvedBy,
                knowledgeDocumentId: ingestion.knowledgeDocumentId,
            });
            // Audit trail for approval
            await service_1.auditService.recordEvent({
                eventType: 'ingestion_approved',
                actor: approvedBy,
                resourceType: 'ingestion',
                resourceId: ingestionId,
                action: 'approve',
                details: {
                    knowledgeDocumentId: ingestion.knowledgeDocumentId,
                },
            });
            return {
                success: true,
                ingestionId,
                status: 'published',
                message: 'Content approved and published',
                knowledgeDocumentId: ingestion.knowledgeDocumentId,
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logging_1.logger.error('Error approving ingestion', err, {
                ingestionId,
            });
            return {
                success: false,
                ingestionId,
                status: 'failed',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    /**
     * Reject an ingestion
     */
    async rejectIngestion(ingestionId, rejectedBy, reason) {
        try {
            await repository_1.telegramIngestionRepository.reject(ingestionId, rejectedBy, reason);
            logging_1.logger.info('Ingestion rejected', {
                ingestionId,
                rejectedBy,
                reason,
            });
            // Audit trail for rejection
            await service_1.auditService.recordEvent({
                eventType: 'ingestion_rejected',
                actor: rejectedBy,
                resourceType: 'ingestion',
                resourceId: ingestionId,
                action: 'reject',
                details: {
                    reason,
                },
            });
            return {
                success: true,
                ingestionId,
                status: 'rejected',
                message: `Rejected: ${reason}`,
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logging_1.logger.error('Error rejecting ingestion', err, {
                ingestionId,
            });
            return {
                success: false,
                ingestionId,
                status: 'failed',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    /**
     * Get ingestion by ID
     */
    async getIngestion(id) {
        return repository_1.telegramIngestionRepository.getById(id);
    }
    /**
     * Get pending ingestions
     */
    async getPendingIngestions(limit = 50) {
        return repository_1.telegramIngestionRepository.getPendingApproval(limit);
    }
    /**
     * Get recent ingestions
     */
    async getRecentIngestions(limit = 50) {
        return repository_1.telegramIngestionRepository.getRecent(limit);
    }
    /**
     * Classify content without creating ingestion
     * Useful for previewing classification
     */
    classifyContent(content, title) {
        return classifier_1.classifierService.classify(content, title);
    }
    /**
     * Validate content without creating ingestion
     */
    validateContent(content) {
        return classifier_1.classifierService.validate(content);
    }
    /**
     * Get operational rules
     */
    async getOperationalRules(ruleType) {
        if (ruleType) {
            return repository_1.telegramIngestionRepository.getOperationalRulesByType(ruleType);
        }
        return repository_1.telegramIngestionRepository.getActiveOperationalRules();
    }
}
exports.telegramIngestionService = new TelegramIngestionService();
//# sourceMappingURL=service.js.map