import crypto, { randomUUID } from 'crypto';
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
  checkResponseGuardrails,
  generateFallbackResponse,
} from '../security/guardrails';
import { classifyIntent } from '../intent/classifier';
import { handleSchedulingStateMachine, markSchedulingIntent } from '../scheduling/state';
import {
  loadConversationContext,
  addMessageToContext,
  formatConversationHistory,
  shouldProcessConversation,
  loadContactAndMemories,
} from '../conversations/contextLoader';
import {
  normalizeMessage,
  isRelevantEvent,
  extractConversationMetadata,
} from '../chatwoot/normalizer';
import { ChatwootWebhookPayload, AgentResponse, KnowledgeChunk } from '../../shared/types';

/**
 * Generate message hash for deduplication
 */
function generateMessageHash(conversationId: number, messageId: number, content: string): string {
  return crypto
    .createHash('sha256')
    .update(`${conversationId}-${messageId}-${content}`)
    .digest('hex');
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
    // Step 1: Check if event is relevant
    if (!isRelevantEvent(payload)) {
      log.info('Event not relevant, skipping', { event: payload.event });
      return;
    }

    // Step 2: Normalize the message
    const normalizedMessage = normalizeMessage(payload);
    if (!normalizedMessage) {
      log.warn('Failed to normalize message');
      return;
    }

    log.info('Message normalized', {
      messageId: normalizedMessage.messageId,
      chatwootMessageId: normalizedMessage.chatwootMessageId,
    });

    const inputGuardrail = checkGuardrails(normalizedMessage.content);
    if (!inputGuardrail.allowed || inputGuardrail.action === 'block') {
      log.warn('Input guardrail blocked message', {
        reason: inputGuardrail.reason,
        action: inputGuardrail.action,
      });

      await chatwootClient.sendMessage({
        conversationId: payload.conversation.id,
        content: generateFallbackResponse('handoff_needed'),
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

    // Track analytics event
    await analyticsService.trackEvent({
      eventType: 'message_received',
      conversationId: normalizedMessage.conversationId,
      contactId: normalizedMessage.contactId,
    });

    // Step 3: Check for duplicates
    const messageHash = generateMessageHash(
      payload.conversation.id,
      payload.message!.id,
      payload.message!.content
    );

    const isDuplicate = await redisClient.checkMessageHash(messageHash);
    if (isDuplicate) {
      log.info('Duplicate message detected, skipping', { messageHash });
      return;
    }

    // Mark as processed
    await redisClient.setMessageHash(messageHash);

    // Step 4: Load conversation context
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

    // Step 5: Check if conversation should be processed
    if (!shouldProcessConversation(context)) {
      log.info('Conversation should not be processed', {
        conversationId: context.conversationId,
        state: context.state,
      });
      return;
    }

    // Step 6: Add message to context
    await addMessageToContext(context, normalizedMessage);

    const deterministicScheduling = await handleSchedulingStateMachine(
      context.conversationId,
      normalizedMessage.content
    );

    if (deterministicScheduling.handled && deterministicScheduling.message) {
      await chatwootClient.sendMessage({
        conversationId: context.chatwootConversationId,
        content: deterministicScheduling.message,
      });

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

    const intent = classifyIntent(normalizedMessage.content, {
      conversationHistory: formatConversationHistory(context.messages.slice(0, -1)),
    });
    const schedulingState = await markSchedulingIntent(
      context.conversationId,
      intent.intent,
      intent.entities.petName
    );

    // Step 7: Prepare agent context (Phase 2 - include memory)
    const memoryContext = await loadContactAndMemories(
      metadata.chatwootContactId,
      metadata.contactName
    );

    // Step 8: Search knowledge base (Phase 3)
    let knowledgeResults: KnowledgeChunk[] = [];
    try {
      const knowledgeSearchResults = await knowledgeRetrievalService.search({
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

      logger.info('Knowledge search completed', {
        resultsCount: knowledgeResults.length,
      });
    } catch (knowledgeError) {
      logger.error('Knowledge search failed', knowledgeError as Error, {});
      // Continue without knowledge - don't fail the whole flow
    }

    const agentContext = {
      conversationId: context.conversationId,
      contactId: memoryContext.contactId ?? context.contactId,
      schedulingState,
      contactName: metadata.contactName,
      conversationHistory: formatConversationHistory(context.messages.slice(0, -1)),
      memories: memoryContext.memories as string[],
      pets: memoryContext.pets,
      knowledge: knowledgeResults,
    };

    // Store contactId in context for tool usage
    const contextWithContact = context as typeof context & { contactId: string };
    contextWithContact.contactId = memoryContext.contactId ?? context.contactId;

    // Step 8: Call AI to generate response
    log.info('Calling AI', { contactName: metadata.contactName, provider: aiRouter.getPrimaryProvider() });

    let agentResponse: AgentResponse;
    try {
      const aiResponse = await aiRouter.generate({
        message: normalizedMessage.content,
        context: agentContext
      });
      agentResponse = {
        content: aiResponse.content,
        confidence: aiResponse.confidence,
        action: aiResponse.action as AgentResponse['action'],
      };
    } catch (error) {
      log.error('AI error, using fallback', error as Error);
      agentResponse = {
        content: 'Peço desculpas, estou tendo dificuldades para processar sua solicitação. Um de nossos atendentes logoirá ajudá-lo.',
        confidence: 0,
        action: { type: 'fallback', reason: 'ai_error' },
      };
      
      // Track fallback event
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

    log.info('Agent response generated', {
      contentLength: agentResponse.content.length,
      confidence: agentResponse.confidence,
    });

    const responseGuardrail = checkResponseGuardrails(agentResponse.content);
    if (!responseGuardrail.allowed) {
      log.warn('Response guardrail intercepted AI response', {
        reason: responseGuardrail.reason,
        action: responseGuardrail.action,
      });

      agentResponse = {
        content: generateFallbackResponse('handoff_needed'),
        confidence: 0,
        action: {
          type: 'handoff',
          reason: responseGuardrail.reason || 'response_guardrail',
          summary: 'Resposta automatica bloqueada por guardrail de seguranca.',
        },
      };

      await analyticsService.trackEvent({
        eventType: 'fallback_triggered',
        conversationId: context.conversationId,
        contactId: context.contactId,
        provider: aiRouter.getPrimaryProvider(),
        metadata: {
          reason: 'response_guardrail_blocked',
          guardrailReason: responseGuardrail.reason,
        },
      });
    }

    // Step 10: Send response to Chatwoot
    try {
      await chatwootClient.sendMessage({
        conversationId: context.chatwootConversationId,
        content: agentResponse.content,
      });

      log.info('Response sent to Chatwoot');
      
      // Track analytics event
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

      // Track handoff if action requires it
      if (agentResponse.action?.type === 'handoff') {
        let handoffId: string | undefined;
        try {
          const handoff = await handoffRepository.create({
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
              handoffReason: agentResponse.action.reason || 'ai_requested',
              pendingQuestions: ['Continuar atendimento com humano.'],
              whatWasAnswered: [agentResponse.content],
            },
            getLabelsForIntent('pedido_humano', 'high')
          );
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
            reason: agentResponse.action.reason || 'ai_requested',
            summary: agentResponse.action.summary,
            handoffId,
          },
        });

        // Audit trail for handoff
        await auditService.recordEvent({
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
    } catch (error) {
      log.error('Failed to send response to Chatwoot', error as Error);
      
      // Track error
      await analyticsService.trackEvent({
        eventType: 'error_occurred',
        conversationId: context.conversationId,
        contactId: context.contactId,
        metadata: {
          errorType: 'chatwoot_send_failed',
          error: (error as Error).message,
        },
      });
      
      // Don't throw - we don't want to retry the whole flow
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

  log.info('Conversation created', {
    conversationId: String(payload.conversation.id),
    contactName: payload.conversation.contact.name,
  });

  // Track conversation started
  const metadata = extractConversationMetadata(payload);
  await analyticsService.trackEvent({
    eventType: 'conversation_started',
    conversationId: metadata.conversationId,
    contactId: metadata.contactId,
  });

  // Just load/create context - don't generate response
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
