import { Appointment, AppointmentSlot, CancelAppointmentInput, CheckAvailableSlotsInput, ConfirmAppointmentInput, ReserveSlotInput } from './types';
export declare function checkAvailableSlots(input: CheckAvailableSlotsInput): Promise<{
    success: boolean;
    slots: AppointmentSlot[];
}>;
export declare function reserveSlot(input: ReserveSlotInput): Promise<{
    success: boolean;
    appointment?: Appointment;
    message: string;
}>;
export declare function confirmAppointment(input: ConfirmAppointmentInput): Promise<{
    success: boolean;
    appointment?: Appointment;
    message: string;
}>;
export declare function cancelAppointment(input: CancelAppointmentInput): Promise<{
    success: boolean;
    appointment?: Appointment;
    message: string;
}>;
export declare function rescheduleAppointment(input: CancelAppointmentInput & ReserveSlotInput): Promise<{
    success: boolean;
    appointment?: Appointment;
    message: string;
}>;
export declare const schedulingTools: {
    check_available_slots: typeof checkAvailableSlots;
    reserve_slot: typeof reserveSlot;
    confirm_appointment: typeof confirmAppointment;
    cancel_appointment: typeof cancelAppointment;
    reschedule_appointment: typeof rescheduleAppointment;
};
export type SchedulingToolName = keyof typeof schedulingTools;
//# sourceMappingURL=tools.d.ts.map