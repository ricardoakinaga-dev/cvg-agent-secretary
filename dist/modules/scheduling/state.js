"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSchedulingState = getSchedulingState;
exports.setSchedulingState = setSchedulingState;
exports.markSchedulingIntent = markSchedulingIntent;
exports.handleSchedulingStateMachine = handleSchedulingStateMachine;
const redis_1 = require("../../shared/redis");
const logging_1 = require("../logging");
const tools_1 = require("./tools");
const DEFAULT_TTL_SECONDS = 86400;
function keyForConversation(conversationId) {
    return `conversation:${conversationId}:scheduling`;
}
async function getSchedulingState(conversationId) {
    try {
        const data = await redis_1.redisClient.getClient().get(keyForConversation(conversationId));
        return data ? JSON.parse(data) : null;
    }
    catch (error) {
        logging_1.logger.warn('Failed to read scheduling state', {
            conversationId,
            error: error.message,
        });
        return null;
    }
}
async function setSchedulingState(conversationId, state, ttlSeconds = DEFAULT_TTL_SECONDS) {
    try {
        const nextState = {
            ...state,
            updatedAt: new Date().toISOString(),
        };
        await redis_1.redisClient.getClient().setex(keyForConversation(conversationId), ttlSeconds, JSON.stringify(nextState));
    }
    catch (error) {
        logging_1.logger.warn('Failed to write scheduling state', {
            conversationId,
            error: error.message,
        });
    }
}
async function markSchedulingIntent(conversationId, intent, petName) {
    const current = await getSchedulingState(conversationId);
    if (intent === 'cancelamento') {
        const next = {
            stage: 'cancelled',
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
        stage: current?.stage && current.stage !== 'idle' ? current.stage : 'collecting_details',
        appointmentId: current?.appointmentId,
        slotId: current?.slotId,
        serviceId: current?.serviceId,
        petName: petName || current?.petName,
        lastIntent: intent,
    };
    await setSchedulingState(conversationId, next);
    return { ...next, updatedAt: new Date().toISOString() };
}
function isPositiveConfirmation(message) {
    return /\b(sim|confirmo|pode confirmar|fechado|ok|isso mesmo|perfeito)\b/i.test(message);
}
function isNegativeConfirmation(message) {
    return /\b(nao|não|cancelar|cancela|melhor nao|melhor não|outro horario|outro horário)\b/i.test(message);
}
async function handleSchedulingStateMachine(conversationId, message) {
    const state = await getSchedulingState(conversationId);
    if (!state || state.stage !== 'waiting_slot_confirmation' || !state.appointmentId) {
        return { handled: false };
    }
    if (isPositiveConfirmation(message)) {
        const result = await (0, tools_1.confirmAppointment)({ appointmentId: state.appointmentId });
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
//# sourceMappingURL=state.js.map