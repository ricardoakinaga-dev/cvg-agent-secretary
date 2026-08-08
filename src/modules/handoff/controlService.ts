import { maskSensitiveData } from '../../shared/data-masking';
import { redisClient } from '../../shared/redis';
import { chatwootClient } from '../chatwoot/client';
import { conversationRepository } from '../conversations/repository';
import { handoffRepository } from './repository';

export type HandoffResolutionAction = 'resume' | 'complete' | 'cancel';

export interface ResolveHandoffControlInput {
  conversationId: string;
  action: HandoffResolutionAction;
  reason: string;
  actorId: string;
}

export interface ResolvedHandoffControl {
  action: HandoffResolutionAction;
  handoffId: string;
  controlState: 'automated' | 'completed';
  controlVersion: number;
}

const TEMPORARY_HANDOFF_LABELS = ['handoff', 'pending'];

function boundedResolutionNotes(reason: string): string {
  return maskSensitiveData(reason.trim()).slice(0, 500);
}

function updateCachedConversation(
  state: Record<string, unknown>,
  controlState: ResolvedHandoffControl['controlState'],
  controlVersion: number
): Record<string, unknown> {
  const metadata = state.metadata && typeof state.metadata === 'object' && !Array.isArray(state.metadata)
    ? { ...(state.metadata as Record<string, unknown>) }
    : {};

  delete metadata.handoffStartedAt;
  delete metadata.handoffUntil;
  delete metadata.handoffExpiredAt;
  delete metadata.handoffReason;
  metadata.controlVersion = controlVersion;

  return {
    ...state,
    metadata,
    state: controlState === 'automated' ? 'in_progress' : 'completed',
  };
}

/**
 * Resolve a durable handoff through an authenticated operator action.
 *
 * External labels are removed before the durable transition. If Chatwoot or
 * PostgreSQL fails, the conversation remains blocked and the operation can be
 * retried safely. Redis is updated last because it is only a cache.
 */
export async function resolveHandoffControl(
  input: ResolveHandoffControlInput
): Promise<ResolvedHandoffControl> {
  if (!input.actorId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.actorId)) {
    throw new Error('Authenticated operator is required');
  }
  if (!input.reason || input.reason.trim().length < 3 || input.reason.trim().length > 500) {
    throw new Error('Resolution reason must contain between 3 and 500 characters');
  }

  const [conversation, control, handoff] = await Promise.all([
    conversationRepository.findById(input.conversationId),
    conversationRepository.getControlState(input.conversationId),
    handoffRepository.findByConversation(input.conversationId),
  ]);

  if (!conversation) throw new Error('Conversation not found');
  if (!control || !['handoff_pending', 'handoff_active'].includes(control.state)) {
    throw new Error('Conversation is not awaiting handoff resolution');
  }
  if (!handoff) throw new Error('Durable handoff record not found');

  await chatwootClient.removeLabels(conversation.chatwootConversationId, TEMPORARY_HANDOFF_LABELS);

  const nextControlState = input.action === 'resume' ? 'automated' : 'completed';
  const nextHandoffStatus = input.action === 'cancel' ? 'cancelled' : 'completed';
  const resolutionNotes = boundedResolutionNotes(input.reason);
  const updatedHandoff = await handoffRepository.updateStatus(
    handoff.id,
    nextHandoffStatus,
    input.actorId,
    resolutionNotes
  );
  const updatedControl = await conversationRepository.setControlState(
    input.conversationId,
    nextControlState,
    {
      handoffUntil: null,
      handoffExpiredAt: null,
      handoffReason: null,
      handoffOwner: input.action === 'resume' ? null : input.actorId,
      expectedVersion: control.version,
    }
  );

  const cachedState = await redisClient.getConversationState(input.conversationId);
  if (cachedState) {
    await redisClient.setConversationState(
      input.conversationId,
      updateCachedConversation(cachedState, nextControlState, updatedControl.version)
    );
  }

  return {
    action: input.action,
    handoffId: updatedHandoff.id,
    controlState: nextControlState,
    controlVersion: updatedControl.version,
  };
}
