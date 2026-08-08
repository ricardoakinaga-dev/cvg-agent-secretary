import { createHash } from 'node:crypto';
import {
  AgentResponse,
  ConversationContext,
  NormalizedMessage,
} from '../../shared/types';
import { config } from '../../config';
import { aiRouter } from '../ai/router';
import { analyticsService } from '../analytics';
import { auditService } from '../audit/service';
import { executeHandoff, getLabelsForIntent } from '../chatwoot/integration';
import { extractConversationMetadata } from '../chatwoot/normalizer';
import {
  formatConversationHistory,
  saveConversationContext,
  updateConversationState,
} from '../conversations/contextLoader';
import { conversationRepository } from '../conversations/repository';
import { handoffRepository } from '../handoff/repository';
import { IntentClassification } from '../intent/types';
import { logger } from '../logging';
import { metrics, METRICS } from '../../shared/metrics';
import { maskSensitiveData } from '../../shared/data-masking';
import { buildIntakeHandoffContext } from './contactIntake';

type RuntimeLogger = ReturnType<typeof logger.child>;
type ReconciliationLogger = Pick<RuntimeLogger, 'error'>;

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function hashOperationalText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function persistedHandoffText(value: string | undefined, maxChars = 2_000): string | null {
  if (!value) return null;
  return maskSensitiveData(value.trim()).slice(0, maxChars) || null;
}

export interface OperationalHandoffParams {
  context: ConversationContext;
  metadata: ReturnType<typeof extractConversationMetadata>;
  normalizedMessage: NormalizedMessage;
  agentResponse: AgentResponse;
  intentClassification: IntentClassification;
  riskLevel?: 'high' | 'medium' | 'low';
  correlationId?: string;
  log: RuntimeLogger;
  preparedHandoff?: PreparedOperationalHandoff;
}

export interface PreparedOperationalHandoff {
  handoffId: string;
}

interface HandoffDetails {
  reason: string;
  summary: string;
  intakeContext: ReturnType<typeof buildIntakeHandoffContext>;
  idempotencyKey: string;
  triggerType: string;
  priority: 'high' | 'medium';
  riskLevel: 'high' | 'medium' | 'low';
}

function getHandoffDetails(params: OperationalHandoffParams): HandoffDetails {
  const {
    context,
    normalizedMessage,
    agentResponse,
    intentClassification,
    riskLevel,
  } = params;
  const action = agentResponse.action;
  const intakeContext = buildIntakeHandoffContext(
    context.metadata.contactIntake,
    normalizedMessage.content
  );
  const reason = (action?.type === 'handoff' || action?.type === 'fallback'
    ? action.reason
    : undefined)
    || intentClassification.handoffReason
    || 'Atendimento requer humano';
  const actionSummary = (action?.type === 'handoff' ? action.summary : undefined)
    || 'Conversa transferida para atendimento humano.';
  const intakeSummary = context.metadata.contactIntake?.contactRole
    ? `Perfil: ${context.metadata.contactIntake.contactRole}. Motivo: ${intakeContext.whatClientWanted}`
    : '';
  return {
    reason,
    summary: [actionSummary, intakeSummary].filter(Boolean).join(' '),
    intakeContext,
    idempotencyKey: `cvg:handoff:${context.conversationId}:${normalizedMessage.chatwootMessageId}`,
    triggerType: intentClassification.intent === 'possivel_urgencia' ? 'urgency' : 'agent_response',
    priority: riskLevel === 'high' || intentClassification.priority === 'critical' ? 'high' : 'medium',
    riskLevel: riskLevel || intentClassification.riskLevel || 'medium',
  };
}

/**
 * Commits the durable handoff before any bot response is sent externally.
 * If the process crashes after this point, the next worker pass can reconcile
 * the pending handoff without rerunning the AI turn.
 */
export async function prepareOperationalHandoff(
  params: OperationalHandoffParams
): Promise<PreparedOperationalHandoff> {
  const details = getHandoffDetails(params);
  const handoff = await handoffRepository.create({
    conversationId: params.context.conversationId,
    contactId: isUuid(params.context.contactId) ? params.context.contactId : undefined,
    triggerType: details.triggerType,
    triggerReason: persistedHandoffText(details.reason, 500) || 'Atendimento requer humano',
    priority: details.priority,
    summary: persistedHandoffText(details.summary) || undefined,
    pendingQuestions: details.intakeContext.pendingQuestions
      .map((question) => persistedHandoffText(question, 500))
      .filter((question): question is string => Boolean(question)),
    whatWasAnswered: persistedHandoffText(params.agentResponse.content) || undefined,
    whatIsMissing: persistedHandoffText(details.intakeContext.pendingQuestions.join(' ')) || undefined,
    riskLevel: details.riskLevel,
    idempotencyKey: details.idempotencyKey,
  });
  if (!handoff?.id) throw new Error('Handoff was not persisted before response delivery');

  await updateConversationState(params.context, 'handoff', {
    reason: details.reason,
    controlState: 'handoff_pending',
  });
  return { handoffId: handoff.id };
}

export async function executeOperationalHandoff(params: OperationalHandoffParams): Promise<void> {
  const {
    context,
    metadata,
    agentResponse,
    intentClassification,
    riskLevel,
    log,
  } = params;

  const details = getHandoffDetails(params);

  let handoffId: string | undefined;
  let handoffCommitted = false;
  try {
    const prepared = params.preparedHandoff || await prepareOperationalHandoff(params);
    handoffId = prepared.handoffId;

    await executeHandoff(
      context.chatwootConversationId,
      {
        contactName: metadata.contactName,
        conversationHistory: formatConversationHistory(context.messages),
        whatClientWanted: details.intakeContext.whatClientWanted,
        informationCollected: {
          contactId: context.contactId,
          provider: aiRouter.getPrimaryProvider(),
          ...details.intakeContext.informationCollected,
        },
        handoffReason: details.reason,
        pendingQuestions: details.intakeContext.pendingQuestions,
        whatWasAnswered: [agentResponse.content],
        idempotencyKey: details.idempotencyKey,
      },
      getLabelsForIntent(intentClassification.intent, riskLevel || intentClassification.riskLevel)
    );

    await updateConversationState(context, 'handoff', {
      reason: details.reason,
      controlState: 'handoff_active',
    });
    await handoffRepository.updateStatus(handoffId, 'in_progress', 'system');
    handoffCommitted = true;
  } catch (error) {
    metrics.incrementCounter(METRICS.HANDOFF_FAILURES_TOTAL, { outcome: 'failed' });
    log.error('Operational handoff failed', error as Error, {
      conversationId: context.conversationId,
    });

    await analyticsService.trackEvent({
      eventType: 'error_occurred',
      conversationId: context.conversationId,
      contactId: context.contactId,
      metadata: {
        errorType: 'handoff_failed',
        errorHash: hashOperationalText(error instanceof Error ? error.message : String(error)),
      },
    });
  }

  if (!handoffCommitted) {
    await auditService.recordEvent({
      eventType: 'system_error',
      actor: 'system',
      resourceType: 'conversation',
      resourceId: context.conversationId,
      action: 'handoff_failed',
      details: {
        errorType: 'handoff_failed',
        handoffId,
        reasonHash: hashOperationalText(details.reason),
      },
      correlationId: params.correlationId,
      idempotencyKey: `handoff-failed:${context.conversationId}:${params.normalizedMessage.chatwootMessageId}`,
    });
    return;
  }

  await analyticsService.trackEvent({
    eventType: 'handoff_triggered',
    conversationId: context.conversationId,
    contactId: context.contactId,
    outcome: 'handoff_to_human',
    metadata: {
      handoffId,
      reasonHash: hashOperationalText(details.reason),
      triggerType: details.triggerType,
      priority: details.priority,
      riskLevel: details.riskLevel,
    },
  });

  await auditService.recordEvent({
    eventType: 'handoff_triggered',
    actor: 'system',
    resourceType: 'conversation',
    resourceId: context.conversationId,
    action: 'handoff',
    details: {
      handoffId,
      reasonHash: hashOperationalText(details.reason),
      triggerType: details.triggerType,
      priority: details.priority,
      riskLevel: details.riskLevel,
    },
    correlationId: params.correlationId,
    idempotencyKey: `handoff:${handoffId}`,
  });
}

/**
 * Retries only the external portion of a pending handoff. This is used after
 * a crash or Chatwoot timeout; it never re-runs the AI turn or creates a new
 * handoff record.
 */
export async function reconcilePendingHandoff(
  context: ConversationContext,
  log: ReconciliationLogger
): Promise<boolean> {
  const handoff = await handoffRepository.findByConversation(context.conversationId);
  if (!handoff || handoff.status !== 'pending') return false;

  // The control row is authoritative. An operator may have resolved the
  // handoff after the pending record was selected by the sweep; never replay
  // Chatwoot effects or reactivate automation in that race.
  const control = await conversationRepository.getControlState(context.conversationId);
  if (control?.state === 'handoff_active') {
    await handoffRepository.updateStatus(handoff.id, 'in_progress', 'system');
    return true;
  }
  if (control && control.state !== 'handoff_pending') {
    return false;
  }

  const persistedConversation = await conversationRepository.findById(context.conversationId);
  if (!persistedConversation) {
    throw new Error('Conversation for pending handoff was not found');
  }
  const persistedMessages = await conversationRepository.listMessages(context.conversationId, 50);
  const handoffUntil = context.metadata.handoffUntil
    ? new Date(context.metadata.handoffUntil)
    : new Date(handoff.createdAt.getTime() + config.conversation.handoffTimeoutMinutes * 60 * 1_000);
  const idempotencyKey = handoff.idempotencyKey || `cvg:handoff:${context.conversationId}:${handoff.id}`;

  try {
    await executeHandoff(
      persistedConversation.chatwootConversationId,
      {
        contactName: persistedConversation.contactName || 'Cliente',
        conversationHistory: persistedMessages.map((message) => (
          `${message.senderType === 'user' ? (message.senderName || 'Cliente') : 'Atendente'}: ${message.content}`
        )),
        whatClientWanted: handoff.summary || handoff.triggerReason,
        informationCollected: {},
        handoffReason: handoff.triggerReason,
        pendingQuestions: handoff.pendingQuestions,
        whatWasAnswered: handoff.whatWasAnswered ? [handoff.whatWasAnswered] : [],
        idempotencyKey,
      },
      getLabelsForIntent(handoff.triggerType, handoff.riskLevel)
    );
    context.state = 'handoff';
    context.metadata.handoffUntil = handoffUntil.toISOString();
    context.metadata.handoffReason = handoff.triggerReason;
    if (!context.metadata.handoffStartedAt) {
      context.metadata.handoffStartedAt = handoff.createdAt.toISOString();
    }
    await conversationRepository.setControlState(context.conversationId, 'handoff_active', {
      handoffUntil,
      handoffReason: handoff.triggerReason,
      expectedVersion: control?.version,
    });
    await saveConversationContext(context);
    await handoffRepository.updateStatus(handoff.id, 'in_progress', 'system');
    metrics.incrementCounter(METRICS.HANDOFF_FAILURES_TOTAL, { outcome: 'reconciled' });
    return true;
  } catch (error) {
    metrics.incrementCounter(METRICS.HANDOFF_FAILURES_TOTAL, { outcome: 'reconcile_failed' });
    log.error('Pending handoff reconciliation failed', error as Error, {
      conversationId: context.conversationId,
      handoffId: handoff.id,
    });
    return false;
  }
}

export async function reconcilePendingHandoffs(limit = 25): Promise<number> {
  const pending = await handoffRepository.findPending(limit);
  let reconciled = 0;

  for (const handoff of pending) {
    try {
      const conversation = await conversationRepository.findById(handoff.conversationId);
      if (!conversation) continue;
      const control = await conversationRepository.getControlState(handoff.conversationId);
      const context: ConversationContext = {
        conversationId: handoff.conversationId,
        chatwootConversationId: conversation.chatwootConversationId,
        contactId: handoff.contactId || String(conversation.chatwootContactId),
        chatwootContactId: conversation.chatwootContactId,
        contactName: conversation.contactName || 'Cliente',
        messages: [],
        metadata: {
          startedAt: conversation.startedAt,
          messageCount: 0,
          lastMessageAt: conversation.lastMessageAt || conversation.startedAt,
          inboxId: 0,
          accountId: Number(config.chatwoot.accountId),
          handoffStartedAt: handoff.createdAt.toISOString(),
          handoffUntil: control?.handoffUntil?.toISOString(),
          handoffReason: handoff.triggerReason,
        },
        state: 'handoff',
      };
      if (await reconcilePendingHandoff(context, logger)) reconciled += 1;
    } catch (error) {
      logger.error('Pending handoff sweep failed', error as Error, {
        handoffId: handoff.id,
        conversationId: handoff.conversationId,
      });
    }
  }

  return reconciled;
}
