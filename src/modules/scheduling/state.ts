import { redisClient } from '../../shared/redis';
import { logger } from '../logging';
import { confirmAppointment } from './tools';

export type SchedulingStage =
  | 'idle'
  | 'collecting_details'
  | 'checking_availability'
  | 'waiting_slot_confirmation'
  | 'reserved'
  | 'confirmed'
  | 'cancelled';

export interface SchedulingConversationState {
  stage: SchedulingStage;
  appointmentId?: string;
  slotId?: string;
  serviceId?: string;
  petName?: string;
  lastIntent?: string;
  updatedAt: string;
}

export interface SchedulingStateMachineResult {
  handled: boolean;
  message?: string;
  stage?: SchedulingStage;
  appointmentId?: string;
}

const DEFAULT_TTL_SECONDS = 86400;

function keyForConversation(conversationId: string): string {
  return `conversation:${conversationId}:scheduling`;
}

export async function getSchedulingState(
  conversationId: string
): Promise<SchedulingConversationState | null> {
  try {
    const data = await redisClient.getClient().get(keyForConversation(conversationId));
    return data ? JSON.parse(data) as SchedulingConversationState : null;
  } catch (error) {
    logger.warn('Failed to read scheduling state', {
      conversationId,
      error: (error as Error).message,
    });
    return null;
  }
}

export async function setSchedulingState(
  conversationId: string,
  state: Omit<SchedulingConversationState, 'updatedAt'>,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    const nextState: SchedulingConversationState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    await redisClient.getClient().setex(
      keyForConversation(conversationId),
      ttlSeconds,
      JSON.stringify(nextState)
    );
  } catch (error) {
    logger.warn('Failed to write scheduling state', {
      conversationId,
      error: (error as Error).message,
    });
  }
}

export async function markSchedulingIntent(
  conversationId: string,
  intent: string,
  petName?: string
): Promise<SchedulingConversationState | null> {
  const current = await getSchedulingState(conversationId);

  if (intent === 'cancelamento') {
    const next = {
      stage: 'cancelled' as const,
      appointmentId: current?.appointmentId,
      slotId: current?.slotId,
      serviceId: current?.serviceId,
      petName: petName || current?.petName,
      lastIntent: intent,
    };
    await setSchedulingState(conversationId, next);
    return { ...next, updatedAt: new Date().toISOString() };
  }

  if (intent !== 'agendamento') {
    return current;
  }

  const next = {
    stage: current?.stage && current.stage !== 'idle' ? current.stage : 'collecting_details' as const,
    appointmentId: current?.appointmentId,
    slotId: current?.slotId,
    serviceId: current?.serviceId,
    petName: petName || current?.petName,
    lastIntent: intent,
  };
  await setSchedulingState(conversationId, next);
  return { ...next, updatedAt: new Date().toISOString() };
}

function isPositiveConfirmation(message: string): boolean {
  return /\b(sim|confirmo|pode confirmar|fechado|ok|isso mesmo|perfeito)\b/i.test(message);
}

function isNegativeConfirmation(message: string): boolean {
  return /\b(nao|não|cancelar|cancela|melhor nao|melhor não|outro horario|outro horário)\b/i.test(message);
}

export async function handleSchedulingStateMachine(
  conversationId: string,
  message: string
): Promise<SchedulingStateMachineResult> {
  const state = await getSchedulingState(conversationId);

  if (!state || state.stage !== 'waiting_slot_confirmation' || !state.appointmentId) {
    return { handled: false };
  }

  if (isPositiveConfirmation(message)) {
    const result = await confirmAppointment({ appointmentId: state.appointmentId });
    if (!result.success || !result.appointment) {
      return {
        handled: true,
        stage: 'waiting_slot_confirmation',
        appointmentId: state.appointmentId,
        message: 'Nao consegui confirmar esse horario automaticamente. Vou chamar um atendente para verificar para voce.',
      };
    }

    await setSchedulingState(conversationId, {
      stage: 'confirmed',
      appointmentId: result.appointment.id,
      slotId: result.appointment.slotId,
      serviceId: result.appointment.serviceId || undefined,
      petName: result.appointment.petName,
      lastIntent: 'agendamento',
    });

    return {
      handled: true,
      stage: 'confirmed',
      appointmentId: result.appointment.id,
      message: 'Horario confirmado com sucesso. Se precisar alterar alguma informacao, posso te ajudar por aqui.',
    };
  }

  if (isNegativeConfirmation(message)) {
    await setSchedulingState(conversationId, {
      stage: 'collecting_details',
      appointmentId: state.appointmentId,
      slotId: state.slotId,
      serviceId: state.serviceId,
      petName: state.petName,
      lastIntent: 'agendamento',
    });

    return {
      handled: true,
      stage: 'collecting_details',
      appointmentId: state.appointmentId,
      message: 'Sem problema. Me diga qual outro dia ou horario voce prefere para eu verificar novas opcoes.',
    };
  }

  return { handled: false };
}
