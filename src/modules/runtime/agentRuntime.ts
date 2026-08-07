import { randomUUID } from 'crypto';
import { redisClient } from '../../shared/redis';
import { logger } from '../logging';
import { aiRouter } from '../ai/router';
import { analyticsService } from '../analytics/index';
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
  resetExpiredHandoff,
  saveConversationContext,
} from '../conversations/contextLoader';
import { conversationRepository } from '../conversations/repository';
import {
  normalizeMessage,
  isRelevantEvent,
  extractConversationMetadata,
  getWebhookMessage,
} from '../chatwoot/normalizer';
import { ChatwootWebhookPayload, AgentResponse } from '../../shared/types';
import { generateContentDedupHash, generateMessageDedupHash } from './dedup';
import {
  buildWalkInServiceResponse,
  hasWalkInServiceEvidence,
} from '../knowledge/context';
import {
  handleOutgoingMessage,
  looksLikeHumanOperatorMessage,
  pauseConversationForHumanTakeover,
} from './humanTakeover';
import { resolveKnowledge } from './knowledgeResolver';
import { sendBotMessage } from './messageDelivery';
import { executeOperationalHandoff } from './operationalHandoff';
import { sanitizePromptHistory, sanitizePromptMemories } from './promptContext';
import { advanceContactIntake } from './contactIntake';
import {
  enforceSchedulingEvidence,
  enforceUnansweredHandoff,
  responseForRequiredHandoff,
  selectDeterministicResponse,
} from './responsePolicy';

export { looksLikeHumanOperatorMessage } from './humanTakeover';

/**
 * Process a Chatwoot webhook event
 */
export async function processWebhookEvent(
  payload: ChatwootWebhookPayload,
  correlationId: string = randomUUID()
): Promise<void> {
  const startTime = Date.now();
  const claimToken = randomUUID();
  const log = logger.child({ correlationId });
  let messageHash: string | undefined;
  let contentHash: string | undefined;
  let messageClaimed = false;
  let contentClaimed = false;
  let lockResourceId: string | undefined;
  let lockAcquired = false;

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

    const webhookMessage = getWebhookMessage(payload);
    if (!webhookMessage) {
      log.warn('Webhook message missing after relevance check');
      return;
    }

    lockResourceId = `runtime:${normalizedMessage.conversationId}`;
    lockAcquired = await redisClient.acquireLock(lockResourceId, claimToken);
    if (!lockAcquired) {
      throw new Error('Conversation is already being processed');
    }

    messageHash = generateMessageDedupHash(
      payload.conversation.id,
      webhookMessage.id,
      webhookMessage.content
    );

    const isNewMessage = await redisClient.claimMessageHash(messageHash, claimToken);
    if (!isNewMessage) {
      log.info('Duplicate message detected, skipping', { messageHash });
      return;
    }
    messageClaimed = true;

    contentHash = generateContentDedupHash(
      normalizedMessage.conversationId,
      normalizedMessage.contactId,
      normalizedMessage.content
    );

    const isNewContent = await redisClient.claimContentHash(contentHash, claimToken);
    if (!isNewContent) {
      log.info('Duplicate message content detected, skipping', {
        contentHash,
        conversationId: normalizedMessage.conversationId,
        contactId: normalizedMessage.contactId,
      });
      return;
    }
    contentClaimed = true;

    const metadata = extractConversationMetadata(payload);
    const persistedConversation = await conversationRepository.upsertConversation({
      chatwootConversationId: metadata.chatwootConversationId,
      chatwootContactId: metadata.chatwootContactId,
      contactName: metadata.contactName,
      status: metadata.status as 'open' | 'pending' | 'resolved' | 'closed',
      lastMessageAt: normalizedMessage.timestamp,
    });
    await conversationRepository.saveMessage({
      conversationId: persistedConversation.id,
      chatwootMessageId: normalizedMessage.chatwootMessageId,
      content: normalizedMessage.content,
      messageType: 'incoming',
      senderType: 'user',
      senderName: normalizedMessage.senderName,
      createdAt: normalizedMessage.timestamp,
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

      const safeResponse = generateFallbackResponse(inputGuardrail.fallbackType || 'security_block');

      if (inputGuardrail.action === 'handoff') {
        const context = await loadConversationContext(
          metadata.conversationId,
          metadata.chatwootConversationId,
          metadata.contactId,
          metadata.chatwootContactId,
          metadata.contactName,
          metadata.inboxId,
          metadata.accountId
        );
        if (!context.metadata.contactIntake && persistedConversation.contactIntake) {
          context.metadata.contactIntake = persistedConversation.contactIntake;
        }
        await resetExpiredHandoff(context);
        if (!shouldProcessConversation(context)) {
          return;
        }
        await addMessageToContext(context, normalizedMessage);

        const emergencyClassification = classifyIntent(normalizedMessage.content, {
          contactName: metadata.contactName,
        });
        const agentResponse = emergencyClassification.requiresHandoff
          ? responseForRequiredHandoff(emergencyClassification)
          : {
              content: safeResponse,
              confidence: 0,
              action: {
                type: 'handoff' as const,
                reason: inputGuardrail.reason || 'Atendimento requer humano',
                summary: 'Guardrail de entrada determinou transferência imediata.',
              },
            };

        await analyticsService.trackEvent({
          eventType: 'message_received',
          conversationId: context.conversationId,
          contactId: context.contactId,
        });
        await sendBotMessage(
          context.chatwootConversationId,
          persistedConversation.id,
          agentResponse.content
        );
        await analyticsService.trackEvent({
          eventType: 'response_sent',
          conversationId: context.conversationId,
          contactId: context.contactId,
          latency: Date.now() - startTime,
          metadata: {
            confidence: agentResponse.confidence,
            action: 'handoff',
          },
        });
        await executeOperationalHandoff({
          context,
          metadata,
          normalizedMessage,
          agentResponse,
          intentClassification: emergencyClassification,
          riskLevel: emergencyClassification.riskLevel || 'high',
          log,
        });
        return;
      }

      await sendBotMessage(
        metadata.chatwootConversationId,
        persistedConversation.id,
        safeResponse
      );

      await analyticsService.trackEvent({
        eventType: 'fallback_triggered',
        conversationId: normalizedMessage.conversationId,
        contactId: normalizedMessage.contactId,
        metadata: {
          reason: 'input_guardrail_blocked',
          guardrailReason: inputGuardrail.reason,
          delivery: 'safe_response_sent',
        },
      });

      return;
    }

    await analyticsService.trackEvent({
      eventType: 'message_received',
      conversationId: normalizedMessage.conversationId,
      contactId: normalizedMessage.contactId,
    });

    const context = await loadConversationContext(
      metadata.conversationId,
      metadata.chatwootConversationId,
      metadata.contactId,
      metadata.chatwootContactId,
      metadata.contactName,
      metadata.inboxId,
      metadata.accountId
    );
    if (!context.metadata.contactIntake && persistedConversation.contactIntake) {
      context.metadata.contactIntake = persistedConversation.contactIntake;
    }
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
      await sendBotMessage(
        context.chatwootConversationId,
        persistedConversation.id,
        deterministicScheduling.message
      );

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

    const conversationHistory = sanitizePromptHistory(
      formatConversationHistory(context.messages.slice(0, -1))
    );
    let intentClassification = classifyIntent(normalizedMessage.content, {
      conversationHistory,
      contactName: metadata.contactName,
    });

    if (intentClassification.requiresHandoff) {
      const agentResponse = responseForRequiredHandoff(intentClassification);
      await sendBotMessage(
        context.chatwootConversationId,
        persistedConversation.id,
        agentResponse.content
      );

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

    const memoryContext = await loadContactAndMemories(
      metadata.chatwootContactId,
      metadata.contactName
    );
    const intakeDecision = advanceContactIntake({
      currentState: context.metadata.contactIntake,
      message: normalizedMessage.content,
      classification: intentClassification,
      knownPets: memoryContext.pets.map(pet => ({
        name: pet.name,
        species: pet.species,
      })),
    });
    context.metadata.contactIntake = intakeDecision.state;
    await conversationRepository.updateContactIntake(
      persistedConversation.id,
      intakeDecision.state
    );
    await saveConversationContext(context);

    if (intakeDecision.status === 'needs_input' && intakeDecision.response) {
      await sendBotMessage(
        context.chatwootConversationId,
        persistedConversation.id,
        intakeDecision.response
      );
      await analyticsService.trackEvent({
        eventType: 'response_sent',
        conversationId: context.conversationId,
        contactId: context.contactId,
        latency: Date.now() - startTime,
        metadata: {
          action: 'contact_intake',
          stage: intakeDecision.state.stage,
        },
      });
      return;
    }

    if (intakeDecision.status === 'handoff' && intakeDecision.response) {
      const intakeClassification = {
        ...intentClassification,
        requiresHandoff: true,
        handoffReason: intakeDecision.handoffReason,
        priority: 'medium' as const,
        riskLevel: 'low' as const,
      };
      const agentResponse: AgentResponse = {
        content: intakeDecision.response,
        confidence: 0,
        action: {
          type: 'handoff',
          reason: intakeDecision.handoffReason || 'Coleta inicial incompleta',
          summary: 'O contato não conseguiu concluir a identificação e a coleta inicial.',
        },
      };
      await sendBotMessage(
        context.chatwootConversationId,
        persistedConversation.id,
        agentResponse.content
      );
      await analyticsService.trackEvent({
        eventType: 'response_sent',
        conversationId: context.conversationId,
        contactId: context.contactId,
        latency: Date.now() - startTime,
        metadata: {
          confidence: agentResponse.confidence,
          action: 'handoff',
          stage: intakeDecision.state.stage,
        },
      });
      await executeOperationalHandoff({
        context,
        metadata,
        normalizedMessage,
        agentResponse,
        intentClassification: intakeClassification,
        riskLevel: 'low',
        log,
      });
      return;
    }

    if (
      (intentClassification.intent === 'saudacao'
        || intentClassification.intent === 'desconhecido')
      && intakeDecision.useRetainedReason
      && intakeDecision.state.contactReason
    ) {
      intentClassification = classifyIntent(intakeDecision.state.contactReason, {
        conversationHistory,
        contactName: metadata.contactName,
      });
    }
    const recommendedAction = getRecommendedAction(intentClassification);

    log.info('Runtime intent decision', {
      intent: intentClassification.intent,
      confidence: intentClassification.confidence,
      shouldUseKnowledge: recommendedAction.shouldUseKnowledge,
    });

    const knowledgeResults = await resolveKnowledge({
      query: intakeDecision.knowledgeQuery || normalizedMessage.content,
      intent: intentClassification.intent,
      shouldUseKnowledge: recommendedAction.shouldUseKnowledge,
    });

    if (hasWalkInServiceEvidence(normalizedMessage.content, knowledgeResults)) {
      const content = buildWalkInServiceResponse(normalizedMessage.content, knowledgeResults);
      await sendBotMessage(context.chatwootConversationId, persistedConversation.id, content);

      await analyticsService.trackEvent({
        eventType: 'response_sent',
        conversationId: context.conversationId,
        contactId: context.contactId,
        latency: Date.now() - startTime,
        metadata: {
          action: 'institutional_walk_in_policy',
          intent: intentClassification.intent,
        },
      });

      log.info('Institutional walk-in service policy answered without scheduling', {
        conversationId: context.conversationId,
        intent: intentClassification.intent,
      });
      return;
    }

    const schedulingState = await markSchedulingIntent(
      context.conversationId,
      intentClassification.intent,
      intentClassification.entities.petName || intakeDecision.state.petName
    );

    const agentContext = {
      conversationId: context.conversationId,
      contactId: memoryContext.contactId ?? context.contactId,
      schedulingState,
      contactName: metadata.contactName,
      conversationHistory,
      memories: sanitizePromptMemories(memoryContext.memories as string[]),
      pets: memoryContext.pets,
      knowledge: knowledgeResults,
      contactIntake: intakeDecision.state.contactRole && intakeDecision.state.contactReason
        ? {
            contactRole: intakeDecision.state.contactRole,
            contactReason: intakeDecision.state.contactReason,
          }
        : undefined,
    };
    const safeUserMessage = sanitizeForPrompt(
      intakeDecision.useRetainedReason && intakeDecision.state.contactReason
        ? intakeDecision.state.contactReason
        : normalizedMessage.content
    );

    const contextWithContact = context as typeof context & { contactId: string };
    contextWithContact.contactId = memoryContext.contactId ?? context.contactId;

    let agentResponse = selectDeterministicResponse({
      message: normalizedMessage.content,
      classification: intentClassification,
      shouldUseKnowledge: recommendedAction.shouldUseKnowledge,
      knowledge: knowledgeResults,
    });
    if (!agentResponse) {
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

    agentResponse = enforceSchedulingEvidence({
      message: normalizedMessage.content,
      classification: intentClassification,
      knowledge: knowledgeResults,
      response: agentResponse,
    });

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

    agentResponse = enforceUnansweredHandoff(agentResponse);

    log.info('Agent response generated', {
      contentLength: agentResponse.content.length,
      confidence: agentResponse.confidence,
    });

    try {
      await sendBotMessage(
        context.chatwootConversationId,
        persistedConversation.id,
        agentResponse.content
      );

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

      try {
        await analyticsService.trackEvent({
          eventType: 'error_occurred',
          conversationId: context.conversationId,
          contactId: context.contactId,
          metadata: {
            errorType: 'chatwoot_send_failed',
            error: (error as Error).message,
          },
        });
      } catch (metricsError) {
        log.error('Failed to record Chatwoot send error metric', metricsError as Error);
      }

      throw error;
    }

    log.info('Webhook processing completed', {
      correlationId,
      conversationId: context.conversationId,
    });
  } catch (error) {
    const releases: Promise<unknown>[] = [];
    if (contentClaimed && contentHash) {
      releases.push(redisClient.releaseContentHash(contentHash, claimToken));
    }
    if (messageClaimed && messageHash) {
      releases.push(redisClient.releaseMessageHash(messageHash, claimToken));
    }

    const releaseResults = await Promise.allSettled(releases);
    for (const result of releaseResults) {
      if (result.status === 'rejected') {
        log.error('Failed to release runtime dedup claim', result.reason as Error);
      }
    }

    log.error('Error processing webhook', error as Error);
    throw error;
  } finally {
    if (lockAcquired && lockResourceId) {
      try {
        await redisClient.releaseLock(lockResourceId, claimToken);
      } catch (lockError) {
        log.error('Failed to release conversation runtime lock', lockError as Error, {
          lockResourceId,
        });
      }
    }
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
  await conversationRepository.upsertConversation({
    chatwootConversationId: metadata.chatwootConversationId,
    chatwootContactId: metadata.chatwootContactId,
    contactName: metadata.contactName,
    status: metadata.status as 'open' | 'pending' | 'resolved' | 'closed',
  });
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
