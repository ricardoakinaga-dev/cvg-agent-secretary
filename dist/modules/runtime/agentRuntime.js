"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processWebhookEvent = processWebhookEvent;
exports.processConversationCreated = processConversationCreated;
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
const redis_1 = require("../../shared/redis");
const logging_1 = require("../logging");
const client_1 = require("../openai/client");
const client_2 = require("../chatwoot/client");
const retrieval_1 = require("../knowledge/retrieval");
const contextLoader_1 = require("../conversations/contextLoader");
const normalizer_1 = require("../chatwoot/normalizer");
/**
 * Generate message hash for deduplication
 */
function generateMessageHash(conversationId, messageId, content) {
    return crypto_1.default
        .createHash('sha256')
        .update(`${conversationId}-${messageId}-${content}`)
        .digest('hex');
}
/**
 * Process a Chatwoot webhook event
 */
async function processWebhookEvent(payload) {
    const correlationId = (0, uuid_1.v4)();
    const log = logging_1.logger.child({ correlationId });
    log.info('Received webhook event', {
        event: payload.event,
        conversationId: String(payload.conversation?.id),
    });
    try {
        // Step 1: Check if event is relevant
        if (!(0, normalizer_1.isRelevantEvent)(payload)) {
            log.info('Event not relevant, skipping', { event: payload.event });
            return;
        }
        // Step 2: Normalize the message
        const normalizedMessage = (0, normalizer_1.normalizeMessage)(payload);
        if (!normalizedMessage) {
            log.warn('Failed to normalize message');
            return;
        }
        log.info('Message normalized', {
            messageId: normalizedMessage.messageId,
            chatwootMessageId: normalizedMessage.chatwootMessageId,
        });
        // Step 3: Check for duplicates
        const messageHash = generateMessageHash(payload.conversation.id, payload.message.id, payload.message.content);
        const isDuplicate = await redis_1.redisClient.checkMessageHash(messageHash);
        if (isDuplicate) {
            log.info('Duplicate message detected, skipping', { messageHash });
            return;
        }
        // Mark as processed
        await redis_1.redisClient.setMessageHash(messageHash);
        // Step 4: Load conversation context
        const metadata = (0, normalizer_1.extractConversationMetadata)(payload);
        const context = await (0, contextLoader_1.loadConversationContext)(metadata.conversationId, metadata.chatwootConversationId, metadata.contactId, metadata.chatwootContactId, metadata.contactName, metadata.inboxId, metadata.accountId);
        // Step 5: Check if conversation should be processed
        if (!(0, contextLoader_1.shouldProcessConversation)(context)) {
            log.info('Conversation should not be processed', {
                conversationId: context.conversationId,
                state: context.state,
            });
            return;
        }
        // Step 6: Add message to context
        await (0, contextLoader_1.addMessageToContext)(context, normalizedMessage);
        // Step 7: Prepare agent context (Phase 2 - include memory)
        const memoryContext = await (0, contextLoader_1.loadContactAndMemories)(metadata.chatwootContactId, metadata.contactName);
        // Step 8: Search knowledge base (Phase 3)
        let knowledgeResults = [];
        try {
            const knowledgeSearchResults = await retrieval_1.knowledgeRetrievalService.search({
                query: normalizedMessage.content,
                limit: 3,
                minRelevance: 0.7,
            });
            knowledgeResults = knowledgeSearchResults.map(r => ({
                id: r.id,
                content: r.content,
                source: r.source,
                relevance: r.relevance,
                category: r.category,
                title: r.title,
            }));
            logging_1.logger.info('Knowledge search completed', {
                resultsCount: knowledgeResults.length,
            });
        }
        catch (knowledgeError) {
            logging_1.logger.error('Knowledge search failed', knowledgeError, {});
            // Continue without knowledge - don't fail the whole flow
        }
        const agentContext = {
            contactName: metadata.contactName,
            conversationHistory: (0, contextLoader_1.formatConversationHistory)(context.messages.slice(0, -1)),
            memories: memoryContext.memories,
            pets: memoryContext.pets,
            knowledge: knowledgeResults,
        };
        // Store contactId in context for tool usage
        context.contactId = memoryContext.contactId;
        // Step 8: Call OpenAI to generate response
        log.info('Calling OpenAI', { contactName: metadata.contactName });
        let agentResponse;
        try {
            agentResponse = await client_1.openaiClient.generateResponse(normalizedMessage.content, agentContext);
        }
        catch (error) {
            log.error('OpenAI error, using fallback', error);
            agentResponse = {
                content: 'Peço desculpas, estou tendo dificuldades para processar sua solicitação. Um de nossos atendentes logoirá ajudá-lo.',
                confidence: 0,
                action: { type: 'fallback', reason: 'openai_error' },
            };
        }
        log.info('Agent response generated', {
            contentLength: agentResponse.content.length,
            confidence: agentResponse.confidence,
        });
        // Step 10: Send response to Chatwoot
        try {
            await client_2.chatwootClient.sendMessage({
                conversationId: context.chatwootConversationId,
                content: agentResponse.content,
            });
            log.info('Response sent to Chatwoot');
        }
        catch (error) {
            log.error('Failed to send response to Chatwoot', error);
            // Don't throw - we don't want to retry the whole flow
        }
        log.info('Webhook processing completed', {
            correlationId,
            conversationId: context.conversationId,
        });
    }
    catch (error) {
        log.error('Error processing webhook', error);
        throw error;
    }
}
/**
 * Process a conversation created event
 */
async function processConversationCreated(payload) {
    const correlationId = (0, uuid_1.v4)();
    const log = logging_1.logger.child({ correlationId });
    log.info('Conversation created', {
        conversationId: String(payload.conversation.id),
        contactName: payload.conversation.contact.name,
    });
    // Just load/create context - don't generate response
    const metadata = (0, normalizer_1.extractConversationMetadata)(payload);
    await (0, contextLoader_1.loadConversationContext)(metadata.conversationId, metadata.chatwootConversationId, metadata.contactId, metadata.chatwootContactId, metadata.contactName, metadata.inboxId, metadata.accountId);
}
//# sourceMappingURL=agentRuntime.js.map