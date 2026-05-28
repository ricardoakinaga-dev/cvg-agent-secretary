"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processWebhookEvent = processWebhookEvent;
exports.processConversationCreated = processConversationCreated;
const crypto_1 = __importStar(require("crypto"));
const redis_1 = require("../../shared/redis");
const logging_1 = require("../logging");
const router_1 = require("../ai/router");
const client_1 = require("../chatwoot/client");
const retrieval_1 = require("../knowledge/retrieval");
const index_1 = require("../analytics/index");
const service_1 = require("../audit/service");
const repository_1 = require("../handoff/repository");
const integration_1 = require("../chatwoot/integration");
const guardrails_1 = require("../security/guardrails");
const classifier_1 = require("../intent/classifier");
const state_1 = require("../scheduling/state");
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
    const startTime = Date.now();
    const correlationId = (0, crypto_1.randomUUID)();
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
        const inputGuardrail = (0, guardrails_1.checkGuardrails)(normalizedMessage.content);
        if (!inputGuardrail.allowed || inputGuardrail.action === 'block') {
            log.warn('Input guardrail blocked message', {
                reason: inputGuardrail.reason,
                action: inputGuardrail.action,
            });
            await client_1.chatwootClient.sendMessage({
                conversationId: payload.conversation.id,
                content: (0, guardrails_1.generateFallbackResponse)('handoff_needed'),
            });
            await index_1.analyticsService.trackEvent({
                eventType: 'fallback_triggered',
                conversationId: normalizedMessage.conversationId,
                contactId: normalizedMessage.contactId,
                outcome: 'failed',
                metadata: {
                    reason: 'input_guardrail_blocked',
                    guardrailReason: inputGuardrail.reason,
                },
            });
            return;
        }
        // Track analytics event
        await index_1.analyticsService.trackEvent({
            eventType: 'message_received',
            conversationId: normalizedMessage.conversationId,
            contactId: normalizedMessage.contactId,
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
        const deterministicScheduling = await (0, state_1.handleSchedulingStateMachine)(context.conversationId, normalizedMessage.content);
        if (deterministicScheduling.handled && deterministicScheduling.message) {
            await client_1.chatwootClient.sendMessage({
                conversationId: context.chatwootConversationId,
                content: deterministicScheduling.message,
            });
            await index_1.analyticsService.trackEvent({
                eventType: 'response_sent',
                conversationId: context.conversationId,
                contactId: context.contactId,
                latency: Date.now() - startTime,
                metadata: {
                    action: 'scheduling_state_machine',
                    stage: deterministicScheduling.stage,
                    appointmentId: deterministicScheduling.appointmentId,
                },
            });
            return;
        }
        const intent = (0, classifier_1.classifyIntent)(normalizedMessage.content, {
            conversationHistory: (0, contextLoader_1.formatConversationHistory)(context.messages.slice(0, -1)),
        });
        const schedulingState = await (0, state_1.markSchedulingIntent)(context.conversationId, intent.intent, intent.entities.petName);
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
            conversationId: context.conversationId,
            contactId: memoryContext.contactId ?? context.contactId,
            schedulingState,
            contactName: metadata.contactName,
            conversationHistory: (0, contextLoader_1.formatConversationHistory)(context.messages.slice(0, -1)),
            memories: memoryContext.memories,
            pets: memoryContext.pets,
            knowledge: knowledgeResults,
        };
        // Store contactId in context for tool usage
        const contextWithContact = context;
        contextWithContact.contactId = memoryContext.contactId ?? context.contactId;
        // Step 8: Call AI to generate response
        log.info('Calling AI', { contactName: metadata.contactName, provider: router_1.aiRouter.getPrimaryProvider() });
        let agentResponse;
        try {
            const aiResponse = await router_1.aiRouter.generate({
                message: normalizedMessage.content,
                context: agentContext
            });
            agentResponse = {
                content: aiResponse.content,
                confidence: aiResponse.confidence,
                action: aiResponse.action,
            };
        }
        catch (error) {
            log.error('AI error, using fallback', error);
            agentResponse = {
                content: 'Peço desculpas, estou tendo dificuldades para processar sua solicitação. Um de nossos atendentes logoirá ajudá-lo.',
                confidence: 0,
                action: { type: 'fallback', reason: 'ai_error' },
            };
            // Track fallback event
            await index_1.analyticsService.trackEvent({
                eventType: 'fallback_triggered',
                conversationId: context.conversationId,
                contactId: context.contactId,
                provider: router_1.aiRouter.getPrimaryProvider(),
                metadata: {
                    reason: 'ai_error',
                    error: error.message,
                },
            });
        }
        log.info('Agent response generated', {
            contentLength: agentResponse.content.length,
            confidence: agentResponse.confidence,
        });
        const responseGuardrail = (0, guardrails_1.checkResponseGuardrails)(agentResponse.content);
        if (!responseGuardrail.allowed) {
            log.warn('Response guardrail intercepted AI response', {
                reason: responseGuardrail.reason,
                action: responseGuardrail.action,
            });
            agentResponse = {
                content: (0, guardrails_1.generateFallbackResponse)('handoff_needed'),
                confidence: 0,
                action: {
                    type: 'handoff',
                    reason: responseGuardrail.reason || 'response_guardrail',
                    summary: 'Resposta automatica bloqueada por guardrail de seguranca.',
                },
            };
            await index_1.analyticsService.trackEvent({
                eventType: 'fallback_triggered',
                conversationId: context.conversationId,
                contactId: context.contactId,
                provider: router_1.aiRouter.getPrimaryProvider(),
                metadata: {
                    reason: 'response_guardrail_blocked',
                    guardrailReason: responseGuardrail.reason,
                },
            });
        }
        // Step 10: Send response to Chatwoot
        try {
            await client_1.chatwootClient.sendMessage({
                conversationId: context.chatwootConversationId,
                content: agentResponse.content,
            });
            log.info('Response sent to Chatwoot');
            // Track analytics event
            await index_1.analyticsService.trackEvent({
                eventType: 'response_sent',
                conversationId: context.conversationId,
                contactId: context.contactId,
                latency: Date.now() - startTime,
                metadata: {
                    confidence: agentResponse.confidence,
                    action: agentResponse.action?.type,
                },
            });
            // Track handoff if action requires it
            if (agentResponse.action?.type === 'handoff') {
                let handoffId;
                try {
                    const handoff = await repository_1.handoffRepository.create({
                        conversationId: context.conversationId,
                        contactId: context.contactId,
                        triggerType: 'agent_response',
                        triggerReason: agentResponse.action.reason || 'ai_requested',
                        priority: 'high',
                        summary: agentResponse.action.summary,
                        pendingQuestions: ['Continuar atendimento com humano.'],
                        whatWasAnswered: agentResponse.content,
                        whatIsMissing: agentResponse.action.summary,
                        riskLevel: 'high',
                    });
                    handoffId = handoff.id;
                    await (0, integration_1.executeHandoff)(context.chatwootConversationId, {
                        contactName: metadata.contactName,
                        conversationHistory: (0, contextLoader_1.formatConversationHistory)(context.messages),
                        whatClientWanted: normalizedMessage.content,
                        informationCollected: {
                            contactId: context.contactId,
                            provider: router_1.aiRouter.getPrimaryProvider(),
                        },
                        handoffReason: agentResponse.action.reason || 'ai_requested',
                        pendingQuestions: ['Continuar atendimento com humano.'],
                        whatWasAnswered: [agentResponse.content],
                    }, (0, integration_1.getLabelsForIntent)('pedido_humano', 'high'));
                }
                catch (handoffError) {
                    log.error('Operational handoff failed', handoffError, {
                        conversationId: context.conversationId,
                    });
                    await index_1.analyticsService.trackEvent({
                        eventType: 'error_occurred',
                        conversationId: context.conversationId,
                        contactId: context.contactId,
                        metadata: {
                            errorType: 'handoff_failed',
                            error: handoffError.message,
                        },
                    });
                }
                await index_1.analyticsService.trackEvent({
                    eventType: 'handoff_triggered',
                    conversationId: context.conversationId,
                    contactId: context.contactId,
                    outcome: 'handoff_to_human',
                    metadata: {
                        reason: agentResponse.action.reason || 'ai_requested',
                        summary: agentResponse.action.summary,
                        handoffId,
                    },
                });
                // Audit trail for handoff
                await service_1.auditService.recordEvent({
                    eventType: 'handoff_triggered',
                    actor: 'system',
                    resourceType: 'conversation',
                    resourceId: context.conversationId,
                    action: 'handoff',
                    details: {
                        reason: agentResponse.action.reason || 'ai_requested',
                        contactId: context.contactId,
                        summary: agentResponse.action.summary,
                        handoffId,
                    },
                });
            }
        }
        catch (error) {
            log.error('Failed to send response to Chatwoot', error);
            // Track error
            await index_1.analyticsService.trackEvent({
                eventType: 'error_occurred',
                conversationId: context.conversationId,
                contactId: context.contactId,
                metadata: {
                    errorType: 'chatwoot_send_failed',
                    error: error.message,
                },
            });
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
    const correlationId = (0, crypto_1.randomUUID)();
    const log = logging_1.logger.child({ correlationId });
    log.info('Conversation created', {
        conversationId: String(payload.conversation.id),
        contactName: payload.conversation.contact.name,
    });
    // Track conversation started
    const metadata = (0, normalizer_1.extractConversationMetadata)(payload);
    await index_1.analyticsService.trackEvent({
        eventType: 'conversation_started',
        conversationId: metadata.conversationId,
        contactId: metadata.contactId,
    });
    // Just load/create context - don't generate response
    await (0, contextLoader_1.loadConversationContext)(metadata.conversationId, metadata.chatwootConversationId, metadata.contactId, metadata.chatwootContactId, metadata.contactName, metadata.inboxId, metadata.accountId);
}
//# sourceMappingURL=agentRuntime.js.map