"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.looksLikeHumanOperatorMessage = looksLikeHumanOperatorMessage;
exports.processWebhookEvent = processWebhookEvent;
exports.processConversationCreated = processConversationCreated;
const crypto_1 = require("crypto");
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
const dedup_1 = require("./dedup");
const context_1 = require("../knowledge/context");
function createGreetingResponse() {
    return {
        content: 'Olá! Sou a assistente virtual do Centro Veterinário Guarapiranga. Como posso ajudar?',
        confidence: 1,
        action: { type: 'respond', content: 'greeting' },
    };
}
const NO_ANSWER_HANDOFF_MESSAGE = 'Desculpe, não tenho essa resposta então vou te transferir para um atendente humano.';
const EMERGENCY_HANDOFF_MESSAGE = [
    'Isso pode ser uma emergência. Venha ao hospital imediatamente para avaliação presencial.',
    'Vou transferir a conversa para um atendente humano agora para acompanhar seu caso.',
].join(' ');
function sanitizeHistoryForPrompt(history) {
    return history.map((message) => (0, guardrails_1.sanitizeForPrompt)(message));
}
function sanitizeMemoriesForPrompt(memories) {
    return memories.map((memory) => (0, guardrails_1.sanitizeForPrompt)(memory));
}
async function sendBotMessage(conversationId, content) {
    await redis_1.redisClient.markBotOutgoingContent(conversationId, content);
    const sentMessage = await client_1.chatwootClient.sendMessage({
        conversationId,
        content,
    });
    await redis_1.redisClient.markBotOutgoingMessageId(sentMessage.id);
}
function responseForRequiredHandoff(classification) {
    if (classification.intent === 'possivel_urgencia') {
        return {
            content: EMERGENCY_HANDOFF_MESSAGE,
            confidence: 1,
            action: {
                type: 'handoff',
                reason: classification.handoffReason || 'Emergência clínica identificada',
                summary: 'Cliente relatou possível emergência clínica. Orientado a vir imediatamente ao hospital.',
            },
        };
    }
    return {
        content: classification.intent === 'pedido_humano'
            ? 'Vou transferir você para um atendente humano para continuar o atendimento.'
            : NO_ANSWER_HANDOFF_MESSAGE,
        confidence: classification.confidence,
        action: {
            type: 'handoff',
            reason: classification.handoffReason || 'Atendimento requer humano',
            summary: 'Conversa transferida para atendimento humano.',
        },
    };
}
function shouldHandoffForUnansweredResponse(agentResponse) {
    return agentResponse.confidence < 0.6 || agentResponse.action?.type === 'fallback';
}
async function executeOperationalHandoff(params) {
    const { context, metadata, normalizedMessage, agentResponse, intentClassification, riskLevel, log, } = params;
    const action = agentResponse.action;
    const reason = (action?.type === 'handoff' || action?.type === 'fallback' ? action.reason : undefined)
        || intentClassification.handoffReason
        || 'Atendimento requer humano';
    const summary = (action?.type === 'handoff' ? action.summary : undefined)
        || 'Conversa transferida para atendimento humano.';
    let handoffId;
    try {
        const handoff = await repository_1.handoffRepository.create({
            conversationId: context.conversationId,
            contactId: context.contactId,
            triggerType: intentClassification.intent === 'possivel_urgencia' ? 'urgency' : 'agent_response',
            triggerReason: reason,
            priority: riskLevel === 'high' || intentClassification.priority === 'critical' ? 'high' : 'medium',
            summary,
            pendingQuestions: ['Continuar atendimento com humano.'],
            whatWasAnswered: agentResponse.content,
            whatIsMissing: summary,
            riskLevel: riskLevel || intentClassification.riskLevel || 'medium',
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
            handoffReason: reason,
            pendingQuestions: ['Continuar atendimento com humano.'],
            whatWasAnswered: [agentResponse.content],
        }, (0, integration_1.getLabelsForIntent)(intentClassification.intent, riskLevel || intentClassification.riskLevel));
        await (0, contextLoader_1.updateConversationState)(context, 'handoff', { reason });
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
            reason,
            summary,
            handoffId,
        },
    });
    await service_1.auditService.recordEvent({
        eventType: 'handoff_triggered',
        actor: 'system',
        resourceType: 'conversation',
        resourceId: context.conversationId,
        action: 'handoff',
        details: {
            reason,
            contactId: context.contactId,
            summary,
            handoffId,
        },
    });
}
function normalizeForTakeoverDetection(content) {
    return content
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
function looksLikeHumanOperatorMessage(content) {
    const text = normalizeForTakeoverDetection(content);
    return [
        /\bsou\s+(?:do|da)\s+centro\s+veterinario\s+guarapiranga\b/,
        /\baqui\s+(?:e|é)\s+(?:do|da)\s+centro\s+veterinario\s+guarapiranga\b/,
        /\bcentro\s+veterinario\s+guarapiranga\b.*\b(?:posso|podemos)\s+ajudar\b/,
        /\b(?:posso|podemos)\s+ajudar\b.*\bcentro\s+veterinario\s+guarapiranga\b/,
        /\bsou\s+(?:atendente|recepcionista|veterinari[oa])\b/,
        /\bno\s+que\s+(?:posso|podemos)\s+ajudar\b/,
    ].some(pattern => pattern.test(text));
}
async function pauseConversationForHumanTakeover(payload, log, reason) {
    const metadata = (0, normalizer_1.extractConversationMetadata)(payload);
    const context = await (0, contextLoader_1.loadConversationContext)(metadata.conversationId, metadata.chatwootConversationId, metadata.contactId, metadata.chatwootContactId, metadata.contactName, metadata.inboxId, metadata.accountId);
    await (0, contextLoader_1.updateConversationState)(context, 'handoff', { reason });
    log.info('Automation paused for human takeover', {
        conversationId: context.conversationId,
        chatwootConversationId: context.chatwootConversationId,
        reason,
    });
}
async function handleOutgoingMessage(payload, log) {
    const webhookMessage = (0, normalizer_1.getWebhookMessage)(payload);
    if (!(0, normalizer_1.isOutgoingMessage)(webhookMessage)) {
        return false;
    }
    if (webhookMessage.private) {
        log.info('Private outgoing message skipped');
        return true;
    }
    const isKnownBotMessage = await redis_1.redisClient.isBotOutgoingMessageId(webhookMessage.id);
    const isPendingBotMessage = await redis_1.redisClient.consumeBotOutgoingContent(payload.conversation.id, webhookMessage.content || '');
    if (isKnownBotMessage || isPendingBotMessage) {
        log.info('Bot outgoing message detected, skipping human takeover', {
            chatwootMessageId: webhookMessage.id,
        });
        return true;
    }
    await pauseConversationForHumanTakeover(payload, log, 'outgoing_message');
    log.info('Human outgoing message detected, automation paused for conversation', {
        chatwootMessageId: webhookMessage.id,
        senderType: webhookMessage.sender.type,
        senderName: webhookMessage.sender.name,
    });
    return true;
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
        if (await handleOutgoingMessage(payload, log)) {
            return;
        }
        if (!(0, normalizer_1.isRelevantEvent)(payload)) {
            log.info('Event not relevant, skipping', { event: payload.event });
            return;
        }
        const normalizedMessage = (0, normalizer_1.normalizeMessage)(payload);
        if (!normalizedMessage) {
            log.warn('Failed to normalize message');
            return;
        }
        log.info('Message normalized', {
            messageId: normalizedMessage.messageId,
            chatwootMessageId: normalizedMessage.chatwootMessageId,
        });
        if (looksLikeHumanOperatorMessage(normalizedMessage.content)) {
            await pauseConversationForHumanTakeover(payload, log, 'operator_message_pattern');
            log.info('Incoming message looks like human operator reply, skipping bot response', {
                chatwootMessageId: normalizedMessage.chatwootMessageId,
            });
            return;
        }
        const inputGuardrail = (0, guardrails_1.checkGuardrails)(normalizedMessage.content);
        if (!inputGuardrail.allowed) {
            log.warn('Input blocked by security guardrail', {
                reason: inputGuardrail.reason,
                action: inputGuardrail.action,
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
        const webhookMessage = (0, normalizer_1.getWebhookMessage)(payload);
        if (!webhookMessage) {
            log.warn('Webhook message missing after relevance check');
            return;
        }
        const messageHash = (0, dedup_1.generateMessageDedupHash)(payload.conversation.id, webhookMessage.id, webhookMessage.content);
        const isNewMessage = await redis_1.redisClient.setMessageHashIfAbsent(messageHash);
        if (!isNewMessage) {
            log.info('Duplicate message detected, skipping', { messageHash });
            return;
        }
        const contentHash = (0, dedup_1.generateContentDedupHash)(normalizedMessage.conversationId, normalizedMessage.contactId, normalizedMessage.content);
        const isNewContent = await redis_1.redisClient.setContentHashIfAbsent(contentHash);
        if (!isNewContent) {
            log.info('Duplicate message content detected, skipping', {
                contentHash,
                conversationId: normalizedMessage.conversationId,
                contactId: normalizedMessage.contactId,
            });
            return;
        }
        await index_1.analyticsService.trackEvent({
            eventType: 'message_received',
            conversationId: normalizedMessage.conversationId,
            contactId: normalizedMessage.contactId,
        });
        const metadata = (0, normalizer_1.extractConversationMetadata)(payload);
        const context = await (0, contextLoader_1.loadConversationContext)(metadata.conversationId, metadata.chatwootConversationId, metadata.contactId, metadata.chatwootContactId, metadata.contactName, metadata.inboxId, metadata.accountId);
        await (0, contextLoader_1.resetExpiredHandoff)(context);
        if (!(0, contextLoader_1.shouldProcessConversation)(context)) {
            log.info('Conversation should not be processed', {
                conversationId: context.conversationId,
                state: context.state,
            });
            return;
        }
        await (0, contextLoader_1.addMessageToContext)(context, normalizedMessage);
        const deterministicScheduling = await (0, state_1.handleSchedulingStateMachine)(context.conversationId, normalizedMessage.content);
        if (deterministicScheduling.handled && deterministicScheduling.message) {
            await sendBotMessage(context.chatwootConversationId, deterministicScheduling.message);
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
        const conversationHistory = sanitizeHistoryForPrompt((0, contextLoader_1.formatConversationHistory)(context.messages.slice(0, -1)));
        const intentClassification = (0, classifier_1.classifyIntent)(normalizedMessage.content, {
            conversationHistory,
            contactName: metadata.contactName,
        });
        const recommendedAction = (0, classifier_1.getRecommendedAction)(intentClassification);
        if (intentClassification.requiresHandoff) {
            const agentResponse = responseForRequiredHandoff(intentClassification);
            await sendBotMessage(context.chatwootConversationId, agentResponse.content);
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
            await executeOperationalHandoff({
                context,
                metadata,
                normalizedMessage,
                agentResponse,
                intentClassification,
                riskLevel: intentClassification.riskLevel,
                log,
            });
            log.info('Webhook processing completed', {
                correlationId,
                conversationId: context.conversationId,
            });
            return;
        }
        const schedulingState = await (0, state_1.markSchedulingIntent)(context.conversationId, intentClassification.intent, intentClassification.entities.petName);
        log.info('Runtime intent decision', {
            intent: intentClassification.intent,
            confidence: intentClassification.confidence,
            shouldUseKnowledge: recommendedAction.shouldUseKnowledge,
        });
        const memoryContext = await (0, contextLoader_1.loadContactAndMemories)(metadata.chatwootContactId, metadata.contactName);
        let knowledgeResults = [];
        if (recommendedAction.shouldUseKnowledge) {
            try {
                const knowledgeSearchResults = await retrieval_1.knowledgeRetrievalService.search({
                    query: normalizedMessage.content,
                    limit: 3,
                    minRelevance: 0.7,
                });
                const rawKnowledgeResults = knowledgeSearchResults.map(r => ({
                    id: r.id,
                    content: r.content,
                    source: r.source,
                    relevance: r.relevance,
                    category: r.category,
                    title: r.title,
                }));
                knowledgeResults = (0, context_1.buildKnowledgeContext)(normalizedMessage.content, rawKnowledgeResults);
                logging_1.logger.info('Knowledge search completed', {
                    resultsCount: knowledgeResults.length,
                    pricingQuery: (0, context_1.isPricingQuery)(normalizedMessage.content),
                    hasPriceEvidence: (0, context_1.hasPriceEvidence)(knowledgeResults),
                    hoursQuery: (0, context_1.isHoursQuery)(normalizedMessage.content),
                    hasHoursEvidence: (0, context_1.hasHoursEvidence)(knowledgeResults),
                });
            }
            catch (knowledgeError) {
                logging_1.logger.error('Knowledge search failed', knowledgeError, {});
            }
        }
        else {
            logging_1.logger.info('Knowledge search skipped by intent decision', {
                intent: intentClassification.intent,
            });
        }
        const agentContext = {
            conversationId: context.conversationId,
            contactId: memoryContext.contactId ?? context.contactId,
            schedulingState,
            contactName: metadata.contactName,
            conversationHistory,
            memories: sanitizeMemoriesForPrompt(memoryContext.memories),
            pets: memoryContext.pets,
            knowledge: knowledgeResults,
        };
        const safeUserMessage = (0, guardrails_1.sanitizeForPrompt)(normalizedMessage.content);
        const contextWithContact = context;
        contextWithContact.contactId = memoryContext.contactId ?? context.contactId;
        let agentResponse;
        if (intentClassification.intent === 'saudacao') {
            agentResponse = createGreetingResponse();
        }
        else if (recommendedAction.shouldUseKnowledge && knowledgeResults.length === 0) {
            agentResponse = {
                content: (0, guardrails_1.generateFallbackResponse)('no_knowledge'),
                confidence: 0,
                action: { type: 'fallback', reason: 'knowledge_not_found' },
            };
        }
        else if ((0, context_1.isPricingQuery)(normalizedMessage.content) && !(0, context_1.hasPriceEvidence)(knowledgeResults)) {
            agentResponse = {
                content: (0, guardrails_1.generateFallbackResponse)('no_knowledge'),
                confidence: 0,
                action: { type: 'fallback', reason: 'pricing_without_knowledge' },
            };
        }
        else if ((0, context_1.isHoursQuery)(normalizedMessage.content) && !(0, context_1.hasHoursEvidence)(knowledgeResults)) {
            agentResponse = {
                content: (0, guardrails_1.generateFallbackResponse)('no_knowledge'),
                confidence: 0,
                action: { type: 'fallback', reason: 'hours_without_knowledge' },
            };
        }
        else {
            log.info('Calling AI', { contactName: metadata.contactName, provider: router_1.aiRouter.getPrimaryProvider() });
            try {
                const aiResponse = await router_1.aiRouter.generate({
                    message: safeUserMessage,
                    context: agentContext,
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
                    content: 'Peço desculpas, estou tendo dificuldades para processar sua solicitação. Um de nossos atendentes logo irá ajudá-lo.',
                    confidence: 0,
                    action: { type: 'fallback', reason: 'ai_error' },
                };
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
        }
        const responseGuardrail = (0, guardrails_1.checkResponseGuardrails)(agentResponse.content);
        const commercialGuardrail = (0, guardrails_1.checkCommercialResponseGuardrails)(normalizedMessage.content, agentResponse.content, knowledgeResults);
        if (!responseGuardrail.allowed || !commercialGuardrail.allowed) {
            const fallbackType = commercialGuardrail.fallbackType || responseGuardrail.fallbackType || 'low_confidence';
            agentResponse = {
                content: (0, guardrails_1.generateFallbackResponse)(fallbackType),
                confidence: 0,
                action: {
                    type: fallbackType === 'handoff_needed' ? 'handoff' : 'fallback',
                    reason: commercialGuardrail.reason || responseGuardrail.reason || 'response_guardrail',
                    summary: 'Resposta bloqueada por guardrail',
                },
            };
            await index_1.analyticsService.trackEvent({
                eventType: 'fallback_triggered',
                conversationId: context.conversationId,
                contactId: context.contactId,
                provider: router_1.aiRouter.getPrimaryProvider(),
                metadata: {
                    reason: 'response_guardrail_blocked',
                    guardrailReason: commercialGuardrail.reason || responseGuardrail.reason,
                },
            });
        }
        if (agentResponse.action?.type !== 'handoff'
            && shouldHandoffForUnansweredResponse(agentResponse)
            && agentResponse.action?.type !== 'respond') {
            agentResponse = {
                content: NO_ANSWER_HANDOFF_MESSAGE,
                confidence: agentResponse.confidence,
                action: {
                    type: 'handoff',
                    reason: agentResponse.action?.reason || 'Resposta com baixa confiança',
                    summary: 'O bot não encontrou uma resposta adequada e transferiu para atendimento humano.',
                },
            };
        }
        else if (agentResponse.confidence < 0.6 && agentResponse.action?.type !== 'handoff') {
            agentResponse = {
                content: NO_ANSWER_HANDOFF_MESSAGE,
                confidence: agentResponse.confidence,
                action: {
                    type: 'handoff',
                    reason: 'Resposta com baixa confiança',
                    summary: 'O bot não teve confiança suficiente para resolver a solicitação.',
                },
            };
        }
        log.info('Agent response generated', {
            contentLength: agentResponse.content.length,
            confidence: agentResponse.confidence,
        });
        try {
            await sendBotMessage(context.chatwootConversationId, agentResponse.content);
            log.info('Response sent to Chatwoot');
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
            if (agentResponse.action?.type === 'handoff') {
                await executeOperationalHandoff({
                    context,
                    metadata,
                    normalizedMessage,
                    agentResponse,
                    intentClassification,
                    riskLevel: intentClassification.riskLevel,
                    log,
                });
            }
        }
        catch (error) {
            log.error('Failed to send response to Chatwoot', error);
            await index_1.analyticsService.trackEvent({
                eventType: 'error_occurred',
                conversationId: context.conversationId,
                contactId: context.contactId,
                metadata: {
                    errorType: 'chatwoot_send_failed',
                    error: error.message,
                },
            });
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
    if (!payload.conversation) {
        log.warn('Conversation created event missing conversation payload', {
            payloadId: payload.id ? String(payload.id) : undefined,
        });
        return;
    }
    log.info('Conversation created', {
        conversationId: String(payload.conversation.id),
        contactName: (0, normalizer_1.extractConversationMetadata)(payload).contactName,
    });
    const metadata = (0, normalizer_1.extractConversationMetadata)(payload);
    await index_1.analyticsService.trackEvent({
        eventType: 'conversation_started',
        conversationId: metadata.conversationId,
        contactId: metadata.contactId,
    });
    await (0, contextLoader_1.loadConversationContext)(metadata.conversationId, metadata.chatwootConversationId, metadata.contactId, metadata.chatwootContactId, metadata.contactName, metadata.inboxId, metadata.accountId);
}
//# sourceMappingURL=agentRuntime.js.map