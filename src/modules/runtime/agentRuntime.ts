import { randomUUID } from 'crypto';
import { redisClient } from '../../shared/redis';
import { logger } from '../logging';
import { aiRouter } from '../ai/router';
import { chatwootClient } from '../chatwoot/client';
import { knowledgeRetrievalService } from '../knowledge/retrieval';
import { analyticsService } from '../analytics/index';
import { auditService } from '../audit/service';
import { handoffRepository } from '../handoff/repository';
import { executeHandoff, getLabelsForIntent } from '../chatwoot/integration';
import {
  checkGuardrails,
  checkCommercialResponseGuardrails,
  checkResponseGuardrails,
  generateFallbackResponse,
  sanitizeForPrompt,
} from '../security/guardrails';
import { classifyIntent, getRecommendedAction } from '../intent/classifier';
import { handleSchedulingStateMachine, markSchedulingIntent } from '../scheduling/state';
import {
  loadConversationContext,
  addMessageToContext,
  formatConversationHistory,
  shouldProcessConversation,
  loadContactAndMemories,
  updateConversationState,
  resetExpiredHandoff,
} from '../conversations/contextLoader';
import {
  normalizeMessage,
  isRelevantEvent,
  extractConversationMetadata,
  getWebhookMessage,
  isOutgoingMessage,
} from '../chatwoot/normalizer';
import { ChatwootWebhookPayload, AgentResponse, KnowledgeChunk } from '../../shared/types';
import { IntentClassification } from '../intent/types';
import { generateContentDedupHash, generateMessageDedupHash } from './dedup';
import {
  buildKnowledgeContext,
  hasHoursEvidence,
  hasPriceEvidence,
  isHoursQuery,
  isPricingQuery,
} from '../knowledge/context';

function createGreetingResponse(): AgentResponse {
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

function sanitizeHistoryForPrompt(history: string[]): string[] {
  return history.map((message) => sanitizeForPrompt(message));
}

function sanitizeMemoriesForPrompt(memories: string[]): string[] {
  return memories.map((memory) => sanitizeForPrompt(memory));
}

async function sendBotMessage(conversationId: number, content: string): Promise<void> {
  await redisClient.markBotOutgoingContent(conversationId, content);
  const sentMessage = await chatwootClient.sendMessage({
    conversationId,
    content,
  });
  await redisClient.markBotOutgoingMessageId(sentMessage.id);
}

function responseForRequiredHandoff(classification: IntentClassification): AgentResponse {
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

function shouldHandoffForUnansweredResponse(agentResponse: AgentResponse): boolean {
  return agentResponse.confidence < 0.6 || agentResponse.action?.type === 'fallback';
}

async function executeOperationalHandoff(params: {
  context: Awaited<ReturnType<typeof loadConversationContext>>;
  metadata: ReturnType<typeof extractConversationMetadata>;
  normalizedMessage: NonNullable<ReturnType<typeof normalizeMessage>>;
  agentResponse: AgentResponse;
  intentClassification: IntentClassification;
  riskLevel?: 'high' | 'medium' | 'low';
  log: ReturnType<typeof logger.child>;
}): Promise<void> {
  const {
    context,
    metadata,
    normalizedMessage,
    agentResponse,
    intentClassification,
    riskLevel,
    log,
  } = params;

  const action = agentResponse.action;
  const reason = (action?.type === 'handoff' || action?.type === 'fallback' ? action.reason : undefined)
    || intentClassification.handoffReason
    || 'Atendimento requer humano';
  const summary = (action?.type === 'handoff' ? action.summary : undefined)
    || 'Conversa transferida para atendimento humano.';

  let handoffId: string | undefined;
  try {
    const handoff = await handoffRepository.create({
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

    await executeHandoff(
      context.chatwootConversationId,
      {
        contactName: metadata.contactName,
        conversationHistory: formatConversationHistory(context.messages),
        whatClientWanted: normalizedMessage.content,
        informationCollected: {
          contactId: context.contactId,
          provider: aiRouter.getPrimaryProvider(),
        },
        handoffReason: reason,
        pendingQuestions: ['Continuar atendimento com humano.'],
        whatWasAnswered: [agentResponse.content],
      },
      getLabelsForIntent(intentClassification.intent, riskLevel || intentClassification.riskLevel)
    );

    await updateConversationState(context, 'handoff', { reason });
  } catch (handoffError) {
    log.error('Operational handoff failed', handoffError as Error, {
      conversationId: context.conversationId,
    });

    await analyticsService.trackEvent({
      eventType: 'error_occurred',
      conversationId: context.conversationId,
      contactId: context.contactId,
      metadata: {
        errorType: 'handoff_failed',
        error: (handoffError as Error).message,
      },
    });
  }

  await analyticsService.trackEvent({
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

  await auditService.recordEvent({
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

function normalizeForTakeoverDetection(content: string): string {
  return content
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function looksLikeHumanOperatorMessage(content: string): boolean {
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

async function pauseConversationForHumanTakeover(
  payload: ChatwootWebhookPayload,
  log: ReturnType<typeof logger.child>,
  reason: string
): Promise<void> {
  const metadata = extractConversationMetadata(payload);
  const context = await loadConversationContext(
    metadata.conversationId,
    metadata.chatwootConversationId,
    metadata.contactId,
    metadata.chatwootContactId,
    metadata.contactName,
    metadata.inboxId,
    metadata.accountId
  );

  await updateConversationState(context, 'handoff', { reason });

  log.info('Automation paused for human takeover', {
    conversationId: context.conversationId,
    chatwootConversationId: context.chatwootConversationId,
    reason,
  });
}

async function handleOutgoingMessage(
  payload: ChatwootWebhookPayload,
  log: ReturnType<typeof logger.child>
): Promise<boolean> {
  const webhookMessage = getWebhookMessage(payload);
  if (!isOutgoingMessage(webhookMessage)) {
    return false;
  }

  if (webhookMessage.private) {
    log.info('Private outgoing message skipped');
    return true;
  }

  const isKnownBotMessage = await redisClient.isBotOutgoingMessageId(webhookMessage.id);
  const isPendingBotMessage = await redisClient.consumeBotOutgoingContent(
    payload.conversation.id,
    webhookMessage.content || ''
  );

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
export async function processWebhookEvent(payload: ChatwootWebhookPayload): Promise<void> {
  const startTime = Date.now();
  const correlationId = randomUUID();
  const log = logger.child({ correlationId });

  log.info('Received webhook event', {
    event: payload.event,
    conversationId: String(payload.conversation?.id),
  });

  try {
    if (await handleOutgoingMessage(payload, log)) {
      return;
    }

    if (!isRelevantEvent(payload)) {
      log.info('Event not relevant, skipping', { event: payload.event });
      return;
    }

    const normalizedMessage = normalizeMessage(payload);
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

    const inputGuardrail = checkGuardrails(normalizedMessage.content);
    if (!inputGuardrail.allowed) {
      log.warn('Input blocked by security guardrail', {
        reason: inputGuardrail.reason,
        action: inputGuardrail.action,
      });

      await analyticsService.trackEvent({
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

    const webhookMessage = getWebhookMessage(payload);
    if (!webhookMessage) {
      log.warn('Webhook message missing after relevance check');
      return;
    }

    const messageHash = generateMessageDedupHash(
      payload.conversation.id,
      webhookMessage.id,
      webhookMessage.content
    );

    const isNewMessage = await redisClient.setMessageHashIfAbsent(messageHash);
    if (!isNewMessage) {
      log.info('Duplicate message detected, skipping', { messageHash });
      return;
    }

    const contentHash = generateContentDedupHash(
      normalizedMessage.conversationId,
      normalizedMessage.contactId,
      normalizedMessage.content
    );

    const isNewContent = await redisClient.setContentHashIfAbsent(contentHash);
    if (!isNewContent) {
      log.info('Duplicate message content detected, skipping', {
        contentHash,
        conversationId: normalizedMessage.conversationId,
        contactId: normalizedMessage.contactId,
      });
      return;
    }

    await analyticsService.trackEvent({
      eventType: 'message_received',
      conversationId: normalizedMessage.conversationId,
      contactId: normalizedMessage.contactId,
    });

    const metadata = extractConversationMetadata(payload);
    const context = await loadConversationContext(
      metadata.conversationId,
      metadata.chatwootConversationId,
      metadata.contactId,
      metadata.chatwootContactId,
      metadata.contactName,
      metadata.inboxId,
      metadata.accountId
    );
    await resetExpiredHandoff(context);

    if (!shouldProcessConversation(context)) {
      log.info('Conversation should not be processed', {
        conversationId: context.conversationId,
        state: context.state,
      });
      return;
    }

    await addMessageToContext(context, normalizedMessage);

    const deterministicScheduling = await handleSchedulingStateMachine(
      context.conversationId,
      normalizedMessage.content
    );

    if (deterministicScheduling.handled && deterministicScheduling.message) {
      await sendBotMessage(context.chatwootConversationId, deterministicScheduling.message);

      await analyticsService.trackEvent({
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

    const conversationHistory = sanitizeHistoryForPrompt(
      formatConversationHistory(context.messages.slice(0, -1))
    );
    const intentClassification = classifyIntent(normalizedMessage.content, {
      conversationHistory,
      contactName: metadata.contactName,
    });
    const recommendedAction = getRecommendedAction(intentClassification);

    if (intentClassification.requiresHandoff) {
      const agentResponse = responseForRequiredHandoff(intentClassification);
      await sendBotMessage(context.chatwootConversationId, agentResponse.content);

      await analyticsService.trackEvent({
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

    const schedulingState = await markSchedulingIntent(
      context.conversationId,
      intentClassification.intent,
      intentClassification.entities.petName
    );

    log.info('Runtime intent decision', {
      intent: intentClassification.intent,
      confidence: intentClassification.confidence,
      shouldUseKnowledge: recommendedAction.shouldUseKnowledge,
    });

    const memoryContext = await loadContactAndMemories(
      metadata.chatwootContactId,
      metadata.contactName
    );

    let knowledgeResults: KnowledgeChunk[] = [];
    if (recommendedAction.shouldUseKnowledge) {
      try {
        const knowledgeSearchResults = await knowledgeRetrievalService.search({
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
        knowledgeResults = buildKnowledgeContext(normalizedMessage.content, rawKnowledgeResults);

        logger.info('Knowledge search completed', {
          resultsCount: knowledgeResults.length,
          pricingQuery: isPricingQuery(normalizedMessage.content),
          hasPriceEvidence: hasPriceEvidence(knowledgeResults),
          hoursQuery: isHoursQuery(normalizedMessage.content),
          hasHoursEvidence: hasHoursEvidence(knowledgeResults),
        });
      } catch (knowledgeError) {
        logger.error('Knowledge search failed', knowledgeError as Error, {});
      }
    } else {
      logger.info('Knowledge search skipped by intent decision', {
        intent: intentClassification.intent,
      });
    }

    const agentContext = {
      conversationId: context.conversationId,
      contactId: memoryContext.contactId ?? context.contactId,
      schedulingState,
      contactName: metadata.contactName,
      conversationHistory,
      memories: sanitizeMemoriesForPrompt(memoryContext.memories as string[]),
      pets: memoryContext.pets,
      knowledge: knowledgeResults,
    };
    const safeUserMessage = sanitizeForPrompt(normalizedMessage.content);

    const contextWithContact = context as typeof context & { contactId: string };
    contextWithContact.contactId = memoryContext.contactId ?? context.contactId;

    let agentResponse: AgentResponse;
    if (intentClassification.intent === 'saudacao') {
      agentResponse = createGreetingResponse();
    } else if (recommendedAction.shouldUseKnowledge && knowledgeResults.length === 0) {
      agentResponse = {
        content: generateFallbackResponse('no_knowledge'),
        confidence: 0,
        action: { type: 'fallback', reason: 'knowledge_not_found' },
      };
    } else if (isPricingQuery(normalizedMessage.content) && !hasPriceEvidence(knowledgeResults)) {
      agentResponse = {
        content: generateFallbackResponse('no_knowledge'),
        confidence: 0,
        action: { type: 'fallback', reason: 'pricing_without_knowledge' },
      };
    } else if (isHoursQuery(normalizedMessage.content) && !hasHoursEvidence(knowledgeResults)) {
      agentResponse = {
        content: generateFallbackResponse('no_knowledge'),
        confidence: 0,
        action: { type: 'fallback', reason: 'hours_without_knowledge' },
      };
    } else {
      log.info('Calling AI', { contactName: metadata.contactName, provider: aiRouter.getPrimaryProvider() });

      try {
        const aiResponse = await aiRouter.generate({
          message: safeUserMessage,
          context: agentContext,
        });
        agentResponse = {
          content: aiResponse.content,
          confidence: aiResponse.confidence,
          action: aiResponse.action as AgentResponse['action'],
        };
      } catch (error) {
        log.error('AI error, using fallback', error as Error);
        agentResponse = {
          content: 'Peço desculpas, estou tendo dificuldades para processar sua solicitação. Um de nossos atendentes logo irá ajudá-lo.',
          confidence: 0,
          action: { type: 'fallback', reason: 'ai_error' },
        };

        await analyticsService.trackEvent({
          eventType: 'fallback_triggered',
          conversationId: context.conversationId,
          contactId: context.contactId,
          provider: aiRouter.getPrimaryProvider(),
          metadata: {
            reason: 'ai_error',
            error: (error as Error).message,
          },
        });
      }
    }

    const responseGuardrail = checkResponseGuardrails(agentResponse.content);
    const commercialGuardrail = checkCommercialResponseGuardrails(
      normalizedMessage.content,
      agentResponse.content,
      knowledgeResults
    );
    if (!responseGuardrail.allowed || !commercialGuardrail.allowed) {
      const fallbackType = commercialGuardrail.fallbackType || responseGuardrail.fallbackType || 'low_confidence';
      agentResponse = {
        content: generateFallbackResponse(fallbackType),
        confidence: 0,
        action: {
          type: fallbackType === 'handoff_needed' ? 'handoff' : 'fallback',
          reason: commercialGuardrail.reason || responseGuardrail.reason || 'response_guardrail',
          summary: 'Resposta bloqueada por guardrail',
        } as AgentResponse['action'],
      };

      await analyticsService.trackEvent({
        eventType: 'fallback_triggered',
        conversationId: context.conversationId,
        contactId: context.contactId,
        provider: aiRouter.getPrimaryProvider(),
        metadata: {
          reason: 'response_guardrail_blocked',
          guardrailReason: commercialGuardrail.reason || responseGuardrail.reason,
        },
      });
    }

    if (
      agentResponse.action?.type !== 'handoff'
      && shouldHandoffForUnansweredResponse(agentResponse)
      && agentResponse.action?.type !== 'respond'
    ) {
      agentResponse = {
        content: NO_ANSWER_HANDOFF_MESSAGE,
        confidence: agentResponse.confidence,
        action: {
          type: 'handoff',
          reason: agentResponse.action?.reason || 'Resposta com baixa confiança',
          summary: 'O bot não encontrou uma resposta adequada e transferiu para atendimento humano.',
        },
      };
    } else if (agentResponse.confidence < 0.6 && agentResponse.action?.type !== 'handoff') {
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

      await analyticsService.trackEvent({
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
    } catch (error) {
      log.error('Failed to send response to Chatwoot', error as Error);

      await analyticsService.trackEvent({
        eventType: 'error_occurred',
        conversationId: context.conversationId,
        contactId: context.contactId,
        metadata: {
          errorType: 'chatwoot_send_failed',
          error: (error as Error).message,
        },
      });
    }

    log.info('Webhook processing completed', {
      correlationId,
      conversationId: context.conversationId,
    });
  } catch (error) {
    log.error('Error processing webhook', error as Error);
    throw error;
  }
}

/**
 * Process a conversation created event
 */
export async function processConversationCreated(payload: ChatwootWebhookPayload): Promise<void> {
  const correlationId = randomUUID();
  const log = logger.child({ correlationId });

  if (!payload.conversation) {
    log.warn('Conversation created event missing conversation payload', {
      payloadId: payload.id ? String(payload.id) : undefined,
    });
    return;
  }

  log.info('Conversation created', {
    conversationId: String(payload.conversation.id),
    contactName: extractConversationMetadata(payload).contactName,
  });

  const metadata = extractConversationMetadata(payload);
  await analyticsService.trackEvent({
    eventType: 'conversation_started',
    conversationId: metadata.conversationId,
    contactId: metadata.contactId,
  });

  await loadConversationContext(
    metadata.conversationId,
    metadata.chatwootConversationId,
    metadata.contactId,
    metadata.chatwootContactId,
    metadata.contactName,
    metadata.inboxId,
    metadata.accountId
  );
}
