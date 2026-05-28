"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulingTools = void 0;
exports.checkAvailableSlots = checkAvailableSlots;
exports.reserveSlot = reserveSlot;
exports.confirmAppointment = confirmAppointment;
exports.cancelAppointment = cancelAppointment;
exports.rescheduleAppointment = rescheduleAppointment;
const logging_1 = require("../logging");
const repository_1 = require("./repository");
async function checkAvailableSlots(input) {
    try {
        const slots = await repository_1.schedulingRepository.checkAvailableSlots(input);
        return { success: true, slots };
    }
    catch (error) {
        logging_1.logger.error('Tool check_available_slots failed', error);
        return { success: false, slots: [] };
    }
}
async function reserveSlot(input) {
    try {
        const appointment = await repository_1.schedulingRepository.reserveSlot(input);
        return {
            success: true,
            appointment,
            message: 'Slot reserved temporarily',
        };
    }
    catch (error) {
        logging_1.logger.error('Tool reserve_slot failed', error);
        return {
            success: false,
            message: error.message,
        };
    }
}
async function confirmAppointment(input) {
    try {
        const appointment = await repository_1.schedulingRepository.confirmAppointment(input);
        return {
            success: true,
            appointment,
            message: 'Appointment confirmed',
        };
    }
    catch (error) {
        logging_1.logger.error('Tool confirm_appointment failed', error);
        return {
            success: false,
            message: error.message,
        };
    }
}
async function cancelAppointment(input) {
    try {
        const appointment = await repository_1.schedulingRepository.cancelAppointment(input);
        return {
            success: true,
            appointment,
            message: 'Appointment cancelled',
        };
    }
    catch (error) {
        logging_1.logger.error('Tool cancel_appointment failed', error);
        return {
            success: false,
            message: error.message,
        };
    }
}
async function rescheduleAppointment(input) {
    const cancelled = await cancelAppointment({ appointmentId: input.appointmentId, reason: input.reason });
    if (!cancelled.success) {
        return cancelled;
    }
    return reserveSlot(input);
}
exports.schedulingTools = {
    check_available_slots: checkAvailableSlots,
    reserve_slot: reserveSlot,
    confirm_appointment: confirmAppointment,
    cancel_appointment: cancelAppointment,
    reschedule_appointment: rescheduleAppointment,
};
//# sourceMappingURL=tools.js.map