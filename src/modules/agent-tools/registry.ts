import { ChatCompletionTool } from 'openai/resources/chat/completions';
import { searchKnowledge } from '../knowledge/tools';
import { createHandoff, notifySector } from '../handoff/tools';
import {
  cancelAppointment,
  checkAvailableSlots,
  confirmAppointment,
  reserveSlot,
  rescheduleAppointment,
} from '../scheduling/tools';
import { setSchedulingState } from '../scheduling/state';
import { logger } from '../logging';
import { agentToolInputSchemas } from './validation';
import type { ZodTypeAny } from 'zod';
import { createHash } from 'node:crypto';
import { toolExecutionRepository } from './executionRepository';

export interface AgentToolContext {
  conversationId?: string;
  contactId?: string;
  contactName?: string;
  /** Current user-authored turn; never populated from model tool arguments. */
  userMessage?: string;
  /** Chatwoot message identity used to fence mutating tool side effects. */
  turnId?: string;
}

export type AgentToolName =
  | 'search_knowledge'
  | 'check_available_slots'
  | 'reserve_slot'
  | 'confirm_appointment'
  | 'cancel_appointment'
  | 'reschedule_appointment'
  | 'create_handoff'
  | 'notify_sector';

type JsonRecord = Record<string, unknown>;

interface AgentToolDefinition {
  name: AgentToolName;
  schema: ChatCompletionTool;
  validationSchema: ZodTypeAny;
  execute(args: JsonRecord, context: AgentToolContext): Promise<unknown>;
}

function readString(args: JsonRecord, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readDate(args: JsonRecord, key: string): Date | undefined {
  const value = readString(args, key);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readNumber(args: JsonRecord, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(args: JsonRecord, key: string): string[] | undefined {
  const value = args[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function getAppointmentOwnership(context: AgentToolContext): {
  conversationId: string;
  contactId: string;
} | null {
  if (!context.conversationId?.trim() || !context.contactId?.trim()) {
    return null;
  }

  return {
    conversationId: context.conversationId,
    contactId: context.contactId,
  };
}

function ownershipFailure(): { success: false; message: string } {
  return {
    success: false,
    message: 'Appointment ownership context is required',
  };
}

const SCHEDULING_MUTATIONS = new Set<AgentToolName>([
  'reserve_slot',
  'confirm_appointment',
  'cancel_appointment',
  'reschedule_appointment',
]);
const USER_AUTHORIZED_MUTATIONS = new Set<AgentToolName>([
  ...SCHEDULING_MUTATIONS,
  'notify_sector',
]);

function toolIdempotencyKey(toolName: AgentToolName, args: JsonRecord, context: AgentToolContext): string | null {
  if (!context.turnId || !context.conversationId) return null;
  const digest = createHash('sha256')
    .update(JSON.stringify({ toolName, args }))
    .digest('hex');
  return `tool:${context.conversationId}:${context.turnId}:${digest}`.slice(0, 200);
}

function normalizeUserMessage(message: string): string {
  return message
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function hasUserAuthorization(toolName: AgentToolName, userMessage?: string): boolean {
  if (!userMessage?.trim()) return false;
  const message = normalizeUserMessage(userMessage);

  switch (toolName) {
    case 'reserve_slot':
      return /\b(agend\w*|reserv\w*|quero|prefiro|pode ser|esse horario|essa data)\b/.test(message);
    case 'confirm_appointment':
      return /\b(sim|confirmo|confirmar|fechado|isso mesmo|pode confirmar)\b/.test(message);
    case 'cancel_appointment':
      return /\b(cancel\w*|desmarc\w*)\b/.test(message);
    case 'reschedule_appointment':
      return /\b(remarc\w*|reagend\w*|trocar|mudar|outro horario)\b/.test(message);
    case 'notify_sector':
      return /\b(atendente|humano|recepcao|clinico|gerencia|financeiro|urgent\w*|emergenc\w*)\b/.test(message);
    default:
      return true;
  }
}

const tools: AgentToolDefinition[] = [
  {
    name: 'search_knowledge',
    validationSchema: agentToolInputSchemas.search_knowledge,
    schema: {
      type: 'function',
      function: {
        name: 'search_knowledge',
        description: 'Busca informacoes institucionais publicadas na base de conhecimento antes de responder.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', minLength: 1, maxLength: 1000, description: 'Pergunta ou termo de busca do tutor.' },
            category: {
              type: 'string',
              enum: ['faq', 'policy', 'procedure', 'service', 'orientation'],
            },
            limit: { type: 'integer', minimum: 1, maximum: 5 },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    execute: (args) => searchKnowledge({
      query: readString(args, 'query') || '',
      category: readString(args, 'category') as Parameters<typeof searchKnowledge>[0]['category'],
      limit: readNumber(args, 'limit'),
    }),
  },
  {
    name: 'check_available_slots',
    validationSchema: agentToolInputSchemas.check_available_slots,
    schema: {
      type: 'function',
      function: {
        name: 'check_available_slots',
        description: 'Consulta horarios disponiveis reais para um servico antes de oferecer opcoes ao tutor.',
        parameters: {
          type: 'object',
          properties: {
            serviceId: { type: 'string', format: 'uuid' },
            from: { type: 'string', format: 'date-time', description: 'Inicio da janela em ISO-8601.' },
            to: { type: 'string', format: 'date-time', description: 'Fim da janela em ISO-8601.' },
            limit: { type: 'integer', minimum: 1, maximum: 5 },
          },
          required: ['from', 'to'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args) => {
      const from = readDate(args, 'from');
      const to = readDate(args, 'to');
      if (!from || !to) {
        return { success: false, slots: [], message: 'from and to must be valid ISO dates' };
      }
      return checkAvailableSlots({
        serviceId: readString(args, 'serviceId'),
        from,
        to,
        limit: readNumber(args, 'limit'),
      });
    },
  },
  {
    name: 'reserve_slot',
    validationSchema: agentToolInputSchemas.reserve_slot,
    schema: {
      type: 'function',
      function: {
        name: 'reserve_slot',
        description: 'Reserva temporariamente um slot disponivel. Use antes de confirmar um horario.',
        parameters: {
          type: 'object',
          properties: {
            slotId: { type: 'string', format: 'uuid' },
            confirmed: {
              type: 'boolean',
              const: true,
              description: 'Confirma que o tutor escolheu explicitamente este slot.',
            },
            serviceId: { type: 'string', format: 'uuid' },
            petId: { type: 'string', format: 'uuid' },
            tutorName: { type: 'string', minLength: 1, maxLength: 200 },
            petName: { type: 'string', minLength: 1, maxLength: 200 },
            reason: { type: 'string', minLength: 1, maxLength: 1000 },
            holdMinutes: { type: 'integer', minimum: 1, maximum: 60 },
          },
          required: ['slotId', 'confirmed'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const ownership = getAppointmentOwnership(context);
      if (!ownership) return ownershipFailure();

      const result = await reserveSlot({
        slotId: readString(args, 'slotId') || '',
        serviceId: readString(args, 'serviceId'),
        ...ownership,
        petId: readString(args, 'petId'),
        tutorName: readString(args, 'tutorName') || context.contactName,
        petName: readString(args, 'petName'),
        reason: readString(args, 'reason'),
        holdMinutes: readNumber(args, 'holdMinutes'),
      });

      if (result.success && result.appointment) {
        await setSchedulingState(ownership.conversationId, {
          stage: 'waiting_slot_confirmation',
          appointmentId: result.appointment.id,
          slotId: result.appointment.slotId,
          serviceId: result.appointment.serviceId || undefined,
          petName: result.appointment.petName,
          contactId: ownership.contactId,
          lastIntent: 'agendamento',
        });
      }

      return result;
    },
  },
  {
    name: 'confirm_appointment',
    validationSchema: agentToolInputSchemas.confirm_appointment,
    schema: {
      type: 'function',
      function: {
        name: 'confirm_appointment',
        description: 'Confirma um agendamento reservado. O agente so pode dizer que esta confirmado se esta tool retornar success=true.',
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'string', format: 'uuid' },
            confirmed: {
              type: 'boolean',
              const: true,
              description: 'Confirma que o tutor pediu explicitamente esta acao.',
            },
          },
          required: ['appointmentId', 'confirmed'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const ownership = getAppointmentOwnership(context);
      if (!ownership) return ownershipFailure();

      const result = await confirmAppointment({
        appointmentId: readString(args, 'appointmentId') || '',
        ...ownership,
      });

      if (context.conversationId && result.success && result.appointment) {
        await setSchedulingState(context.conversationId, {
          stage: 'confirmed',
          appointmentId: result.appointment.id,
          slotId: result.appointment.slotId,
          serviceId: result.appointment.serviceId || undefined,
          petName: result.appointment.petName,
          contactId: ownership.contactId,
          lastIntent: 'agendamento',
        });
      }

      return result;
    },
  },
  {
    name: 'cancel_appointment',
    validationSchema: agentToolInputSchemas.cancel_appointment,
    schema: {
      type: 'function',
      function: {
        name: 'cancel_appointment',
        description: 'Cancela um agendamento reservado ou confirmado.',
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'string', format: 'uuid' },
            reason: { type: 'string', minLength: 1, maxLength: 1000 },
            confirmed: {
              type: 'boolean',
              const: true,
              description: 'Confirma que o tutor pediu explicitamente esta acao.',
            },
          },
          required: ['appointmentId', 'confirmed'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const ownership = getAppointmentOwnership(context);
      if (!ownership) return ownershipFailure();

      const result = await cancelAppointment({
        appointmentId: readString(args, 'appointmentId') || '',
        reason: readString(args, 'reason'),
        ...ownership,
      });

      if (context.conversationId && result.success && result.appointment) {
        await setSchedulingState(context.conversationId, {
          stage: 'cancelled',
          appointmentId: result.appointment.id,
          slotId: result.appointment.slotId,
          serviceId: result.appointment.serviceId || undefined,
          petName: result.appointment.petName,
          contactId: ownership.contactId,
          lastIntent: 'cancelamento',
        });
      }

      return result;
    },
  },
  {
    name: 'reschedule_appointment',
    validationSchema: agentToolInputSchemas.reschedule_appointment,
    schema: {
      type: 'function',
      function: {
        name: 'reschedule_appointment',
        description: 'Cancela um agendamento existente e reserva outro slot.',
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'string', format: 'uuid' },
            slotId: { type: 'string', format: 'uuid' },
            reason: { type: 'string', minLength: 1, maxLength: 1000 },
            confirmed: {
              type: 'boolean',
              const: true,
              description: 'Confirma que o tutor pediu explicitamente esta acao.',
            },
          },
          required: ['appointmentId', 'slotId', 'confirmed'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const ownership = getAppointmentOwnership(context);
      if (!ownership) return Promise.resolve(ownershipFailure());

      const result = await rescheduleAppointment({
        appointmentId: readString(args, 'appointmentId') || '',
        slotId: readString(args, 'slotId') || '',
        ...ownership,
        reason: readString(args, 'reason'),
      });

      if (result.success && result.appointment) {
        await setSchedulingState(ownership.conversationId, {
          stage: 'waiting_slot_confirmation',
          appointmentId: result.appointment.id,
          slotId: result.appointment.slotId,
          serviceId: result.appointment.serviceId || undefined,
          petName: result.appointment.petName,
          contactId: ownership.contactId,
          lastIntent: 'reagendamento',
        });
      }

      return result;
    },
  },
  {
    name: 'create_handoff',
    validationSchema: agentToolInputSchemas.create_handoff,
    schema: {
      type: 'function',
      function: {
        name: 'create_handoff',
        description: 'Cria transferencia para humano quando ha risco clinico, baixa confianca ou solicitacao do tutor.',
        parameters: {
          type: 'object',
          properties: {
            triggerType: { type: 'string', minLength: 1, maxLength: 50 },
            triggerReason: { type: 'string', minLength: 1, maxLength: 1000 },
            summary: { type: 'string', minLength: 1, maxLength: 4000 },
            pendingQuestions: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 500 } },
            whatWasAnswered: { type: 'string', minLength: 1, maxLength: 4000 },
            whatIsMissing: { type: 'string', minLength: 1, maxLength: 4000 },
            riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          },
          required: ['triggerType', 'triggerReason'],
          additionalProperties: false,
        },
      },
    },
    execute: (args, context) => createHandoff({
      conversationId: context.conversationId || 'unknown',
      contactId: context.contactId,
      triggerType: readString(args, 'triggerType') || '',
      triggerReason: readString(args, 'triggerReason') || '',
      summary: readString(args, 'summary'),
      pendingQuestions: readStringArray(args, 'pendingQuestions'),
      whatWasAnswered: readString(args, 'whatWasAnswered'),
      whatIsMissing: readString(args, 'whatIsMissing'),
      riskLevel: readString(args, 'riskLevel') as Parameters<typeof createHandoff>[0]['riskLevel'],
    }),
  },
  {
    name: 'notify_sector',
    validationSchema: agentToolInputSchemas.notify_sector,
    schema: {
      type: 'function',
      function: {
        name: 'notify_sector',
        description: 'Notifica recepcao, clinico, gerencia ou financeiro sobre uma conversa que precisa de acao.',
        parameters: {
          type: 'object',
          properties: {
            sector: { type: 'string', enum: ['recepcao', 'clinico', 'gerencia', 'financeiro'] },
            message: { type: 'string', minLength: 1, maxLength: 2000 },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            confirmed: {
              type: 'boolean',
              const: true,
              description: 'Confirma que a notificacao interna e necessaria.',
            },
          },
          required: ['sector', 'message', 'confirmed'],
          additionalProperties: false,
        },
      },
    },
    execute: (args, context) => notifySector({
      sector: readString(args, 'sector') as Parameters<typeof notifySector>[0]['sector'],
      message: readString(args, 'message') || '',
      priority: readString(args, 'priority') as Parameters<typeof notifySector>[0]['priority'],
      conversationId: context.conversationId,
      contactId: context.contactId,
    }),
  },
];

const toolByName = new Map<AgentToolName, AgentToolDefinition>(
  tools.map((tool) => [tool.name, tool])
);

export function getOpenAITools(): ChatCompletionTool[] {
  return tools.map((tool) => tool.schema);
}

export async function executeAgentTool(
  name: string,
  rawArguments: string,
  context: AgentToolContext
): Promise<unknown> {
  const tool = toolByName.get(name as AgentToolName);
  if (!tool) {
    return { success: false, message: `Unknown tool: ${name}` };
  }

  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(rawArguments || '{}') as unknown;
  } catch {
    return { success: false, message: 'Tool arguments must be valid JSON' };
  }

  const validation = tool.validationSchema.safeParse(parsedArguments);
  if (!validation.success) {
    logger.warn('Agent tool arguments rejected', { toolName: name });
    return { success: false, message: 'Invalid tool arguments' };
  }

  if (SCHEDULING_MUTATIONS.has(tool.name) && !getAppointmentOwnership(context)) {
    return ownershipFailure();
  }
  if (
    USER_AUTHORIZED_MUTATIONS.has(tool.name)
    && !hasUserAuthorization(tool.name, context.userMessage)
  ) {
    logger.warn('Agent tool mutation rejected without user-turn evidence', { toolName: name });
    return { success: false, message: 'User confirmation is required' };
  }

  const mutating = SCHEDULING_MUTATIONS.has(tool.name) || tool.name === 'create_handoff' || tool.name === 'notify_sector';
  const idempotencyKey = mutating ? toolIdempotencyKey(tool.name, validation.data as JsonRecord, context) : null;
  let executionId: string | undefined;
  const executionStartedAt = Date.now();
  if (idempotencyKey) {
    const claim = await toolExecutionRepository.claim({
      conversationId: context.conversationId as string,
      contactId: context.contactId,
      toolName: tool.name,
      toolInput: validation.data,
      idempotencyKey,
    });
    if (claim.state === 'completed') return claim.output;
    if (claim.state === 'pending') {
      return { success: false, message: 'Tool execution requires reconciliation before retry' };
    }
    executionId = claim.id;
  }

  try {
    const result = await tool.execute(validation.data as JsonRecord, context);
    if (executionId) {
      await toolExecutionRepository.complete(executionId, result, Date.now() - executionStartedAt);
    }
    return result;
  } catch (error) {
    if (executionId) {
      await toolExecutionRepository.fail(
        executionId,
        error instanceof Error ? error.message : String(error),
        Date.now() - executionStartedAt
      );
    }
    logger.error('Agent tool execution failed', error as Error, { toolName: name });
    return {
      success: false,
      message: 'Tool execution failed',
    };
  }
}
