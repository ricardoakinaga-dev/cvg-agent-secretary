"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpenAITools = getOpenAITools;
exports.executeAgentTool = executeAgentTool;
const tools_1 = require("../knowledge/tools");
const tools_2 = require("../handoff/tools");
const tools_3 = require("../scheduling/tools");
const state_1 = require("../scheduling/state");
const logging_1 = require("../logging");
function readString(args, key) {
    const value = args[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
function readDate(args, key) {
    const value = readString(args, key);
    if (!value)
        return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}
function readNumber(args, key) {
    const value = args[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function readStringArray(args, key) {
    const value = args[key];
    if (!Array.isArray(value))
        return undefined;
    return value.filter((item) => typeof item === 'string');
}
const tools = [
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
        execute: (args) => (0, tools_1.searchKnowledge)({
            query: readString(args, 'query') || '',
            category: readString(args, 'category'),
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
            return (0, tools_3.checkAvailableSlots)({
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
            const result = await (0, tools_3.reserveSlot)({
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
                await (0, state_1.setSchedulingState)(context.conversationId, {
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
            const result = await (0, tools_3.confirmAppointment)({ appointmentId: readString(args, 'appointmentId') || '' });
            if (context.conversationId && result.success && result.appointment) {
                await (0, state_1.setSchedulingState)(context.conversationId, {
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
            const result = await (0, tools_3.cancelAppointment)({
                appointmentId: readString(args, 'appointmentId') || '',
                reason: readString(args, 'reason'),
            });
            if (context.conversationId && result.success && result.appointment) {
                await (0, state_1.setSchedulingState)(context.conversationId, {
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
        execute: (args, context) => (0, tools_3.rescheduleAppointment)({
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
        execute: (args, context) => (0, tools_2.createHandoff)({
            conversationId: context.conversationId || 'unknown',
            contactId: context.contactId,
            triggerType: readString(args, 'triggerType') || 'agent_tool',
            triggerReason: readString(args, 'triggerReason') || 'handoff requested',
            summary: readString(args, 'summary'),
            pendingQuestions: readStringArray(args, 'pendingQuestions'),
            whatWasAnswered: readString(args, 'whatWasAnswered'),
            whatIsMissing: readString(args, 'whatIsMissing'),
            riskLevel: readString(args, 'riskLevel'),
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
        execute: (args, context) => (0, tools_2.notifySector)({
            sector: readString(args, 'sector'),
            message: readString(args, 'message') || '',
            priority: readString(args, 'priority'),
            conversationId: context.conversationId,
            contactId: context.contactId,
        }),
    },
];
const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
function getOpenAITools() {
    return tools.map((tool) => tool.schema);
}
async function executeAgentTool(name, rawArguments, context) {
    const tool = toolByName.get(name);
    if (!tool) {
        return { success: false, message: `Unknown tool: ${name}` };
    }
    let args;
    try {
        args = JSON.parse(rawArguments || '{}');
    }
    catch {
        return { success: false, message: 'Tool arguments must be valid JSON' };
    }
    try {
        return await tool.execute(args, context);
    }
    catch (error) {
        logging_1.logger.error('Agent tool execution failed', error, { toolName: name });
        return {
            success: false,
            message: error.message,
        };
    }
}
//# sourceMappingURL=registry.js.map