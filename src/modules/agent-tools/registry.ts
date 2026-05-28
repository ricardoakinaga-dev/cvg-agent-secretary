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

export interface AgentToolContext {
  conversationId?: string;
  contactId?: string;
  contactName?: string;
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

const tools: AgentToolDefinition[] = [
  {
    name: 'search_knowledge',
    schema: {
      type: 'function',
      function: {
        name: 'search_knowledge',
        description: 'Busca informacoes institucionais publicadas na base de conhecimento antes de responder.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Pergunta ou termo de busca do tutor.' },
            category: {
              type: 'string',
              enum: ['faq', 'policy', 'procedure', 'service', 'orientation'],
            },
            limit: { type: 'number', minimum: 1, maximum: 5 },
          },
          required: ['query'],
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
    schema: {
      type: 'function',
      function: {
        name: 'check_available_slots',
        description: 'Consulta horarios disponiveis reais para um servico antes de oferecer opcoes ao tutor.',
        parameters: {
          type: 'object',
          properties: {
            serviceId: { type: 'string' },
            from: { type: 'string', description: 'Inicio da janela em ISO-8601.' },
            to: { type: 'string', description: 'Fim da janela em ISO-8601.' },
            limit: { type: 'number', minimum: 1, maximum: 5 },
          },
          required: ['from', 'to'],
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
    schema: {
      type: 'function',
      function: {
        name: 'reserve_slot',
        description: 'Reserva temporariamente um slot disponivel. Use antes de confirmar um horario.',
        parameters: {
          type: 'object',
          properties: {
            slotId: { type: 'string' },
            serviceId: { type: 'string' },
            petId: { type: 'string' },
            tutorName: { type: 'string' },
            petName: { type: 'string' },
            reason: { type: 'string' },
            holdMinutes: { type: 'number', minimum: 1, maximum: 60 },
          },
          required: ['slotId'],
        },
      },
    },
    execute: async (args, context) => {
      const result = await reserveSlot({
        slotId: readString(args, 'slotId') || '',
        serviceId: readString(args, 'serviceId'),
        conversationId: context.conversationId,
        contactId: context.contactId,
        petId: readString(args, 'petId'),
        tutorName: readString(args, 'tutorName') || context.contactName,
        petName: readString(args, 'petName'),
        reason: readString(args, 'reason'),
        holdMinutes: readNumber(args, 'holdMinutes'),
      });

      if (context.conversationId && result.success && result.appointment) {
        await setSchedulingState(context.conversationId, {
          stage: 'waiting_slot_confirmation',
          appointmentId: result.appointment.id,
          slotId: result.appointment.slotId,
          serviceId: result.appointment.serviceId || undefined,
          petName: result.appointment.petName,
          lastIntent: 'agendamento',
        });
      }

      return result;
    },
  },
  {
    name: 'confirm_appointment',
    schema: {
      type: 'function',
      function: {
        name: 'confirm_appointment',
        description: 'Confirma um agendamento reservado. O agente so pode dizer que esta confirmado se esta tool retornar success=true.',
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'string' },
          },
          required: ['appointmentId'],
        },
      },
    },
    execute: async (args, context) => {
      const result = await confirmAppointment({ appointmentId: readString(args, 'appointmentId') || '' });

      if (context.conversationId && result.success && result.appointment) {
        await setSchedulingState(context.conversationId, {
          stage: 'confirmed',
          appointmentId: result.appointment.id,
          slotId: result.appointment.slotId,
          serviceId: result.appointment.serviceId || undefined,
          petName: result.appointment.petName,
          lastIntent: 'agendamento',
        });
      }

      return result;
    },
  },
  {
    name: 'cancel_appointment',
    schema: {
      type: 'function',
      function: {
        name: 'cancel_appointment',
        description: 'Cancela um agendamento reservado ou confirmado.',
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['appointmentId'],
        },
      },
    },
    execute: async (args, context) => {
      const result = await cancelAppointment({
        appointmentId: readString(args, 'appointmentId') || '',
        reason: readString(args, 'reason'),
      });

      if (context.conversationId && result.success && result.appointment) {
        await setSchedulingState(context.conversationId, {
          stage: 'cancelled',
          appointmentId: result.appointment.id,
          slotId: result.appointment.slotId,
          serviceId: result.appointment.serviceId || undefined,
          petName: result.appointment.petName,
          lastIntent: 'cancelamento',
        });
      }

      return result;
    },
  },
  {
    name: 'reschedule_appointment',
    schema: {
      type: 'function',
      function: {
        name: 'reschedule_appointment',
        description: 'Cancela um agendamento existente e reserva outro slot.',
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'string' },
            slotId: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['appointmentId', 'slotId'],
        },
      },
    },
    execute: (args, context) => rescheduleAppointment({
      appointmentId: readString(args, 'appointmentId') || '',
      slotId: readString(args, 'slotId') || '',
      conversationId: context.conversationId,
      contactId: context.contactId,
      reason: readString(args, 'reason'),
    }),
  },
  {
    name: 'create_handoff',
    schema: {
      type: 'function',
      function: {
        name: 'create_handoff',
        description: 'Cria transferencia para humano quando ha risco clinico, baixa confianca ou solicitacao do tutor.',
        parameters: {
          type: 'object',
          properties: {
            triggerType: { type: 'string' },
            triggerReason: { type: 'string' },
            summary: { type: 'string' },
            pendingQuestions: { type: 'array', items: { type: 'string' } },
            whatWasAnswered: { type: 'string' },
            whatIsMissing: { type: 'string' },
            riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          },
          required: ['triggerType', 'triggerReason'],
        },
      },
    },
    execute: (args, context) => createHandoff({
      conversationId: context.conversationId || 'unknown',
      contactId: context.contactId,
      triggerType: readString(args, 'triggerType') || 'agent_tool',
      triggerReason: readString(args, 'triggerReason') || 'handoff requested',
      summary: readString(args, 'summary'),
      pendingQuestions: readStringArray(args, 'pendingQuestions'),
      whatWasAnswered: readString(args, 'whatWasAnswered'),
      whatIsMissing: readString(args, 'whatIsMissing'),
      riskLevel: readString(args, 'riskLevel') as Parameters<typeof createHandoff>[0]['riskLevel'],
    }),
  },
  {
    name: 'notify_sector',
    schema: {
      type: 'function',
      function: {
        name: 'notify_sector',
        description: 'Notifica recepcao, clinico, gerencia ou financeiro sobre uma conversa que precisa de acao.',
        parameters: {
          type: 'object',
          properties: {
            sector: { type: 'string', enum: ['recepcao', 'clinico', 'gerencia', 'financeiro'] },
            message: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          },
          required: ['sector', 'message'],
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

  let args: JsonRecord;
  try {
    args = JSON.parse(rawArguments || '{}') as JsonRecord;
  } catch {
    return { success: false, message: 'Tool arguments must be valid JSON' };
  }

  try {
    return await tool.execute(args, context);
  } catch (error) {
    logger.error('Agent tool execution failed', error as Error, { toolName: name });
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}
