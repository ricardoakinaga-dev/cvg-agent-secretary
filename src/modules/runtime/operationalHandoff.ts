import {
  AgentResponse,
  ConversationContext,
  NormalizedMessage,
} from '../../shared/types';
import { aiRouter } from '../ai/router';
import { analyticsService } from '../analytics';
import { auditService } from '../audit/service';
import { executeHandoff, getLabelsForIntent } from '../chatwoot/integration';
import { extractConversationMetadata } from '../chatwoot/normalizer';
import { formatConversationHistory, updateConversationState } from '../conversations/contextLoader';
import { handoffRepository } from '../handoff/repository';
import { IntentClassification } from '../intent/types';
import { logger } from '../logging';
import { buildIntakeHandoffContext } from './contactIntake';

type RuntimeLogger = ReturnType<typeof logger.child>;

export async function executeOperationalHandoff(params: {
  context: ConversationContext;
  metadata: ReturnType<typeof extractConversationMetadata>;
  normalizedMessage: NormalizedMessage;
  agentResponse: AgentResponse;
  intentClassification: IntentClassification;
  riskLevel?: 'high' | 'medium' | 'low';
  log: RuntimeLogger;
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
  const summary = [actionSummary, intakeSummary].filter(Boolean).join(' ');

  let handoffId: string | undefined;
  try {
    const handoff = await handoffRepository.create({
      conversationId: context.conversationId,
      contactId: context.contactId,
      triggerType: intentClassification.intent === 'possivel_urgencia' ? 'urgency' : 'agent_response',
      triggerReason: reason,
      priority: riskLevel === 'high' || intentClassification.priority === 'critical' ? 'high' : 'medium',
      summary,
      pendingQuestions: intakeContext.pendingQuestions,
      whatWasAnswered: agentResponse.content,
      whatIsMissing: intakeContext.pendingQuestions.join(' '),
      riskLevel: riskLevel || intentClassification.riskLevel || 'medium',
    });
    handoffId = handoff.id;

    await executeHandoff(
      context.chatwootConversationId,
      {
        contactName: metadata.contactName,
        conversationHistory: formatConversationHistory(context.messages),
        whatClientWanted: intakeContext.whatClientWanted,
        informationCollected: {
          contactId: context.contactId,
          provider: aiRouter.getPrimaryProvider(),
          ...intakeContext.informationCollected,
        },
        handoffReason: reason,
        pendingQuestions: intakeContext.pendingQuestions,
        whatWasAnswered: [agentResponse.content],
      },
      getLabelsForIntent(intentClassification.intent, riskLevel || intentClassification.riskLevel)
    );

    await updateConversationState(context, 'handoff', { reason });
  } catch (error) {
    log.error('Operational handoff failed', error as Error, {
      conversationId: context.conversationId,
    });

    await analyticsService.trackEvent({
      eventType: 'error_occurred',
      conversationId: context.conversationId,
      contactId: context.contactId,
      metadata: {
        errorType: 'handoff_failed',
        error: (error as Error).message,
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
