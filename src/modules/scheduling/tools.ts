import { logger } from '../logging';
import { schedulingRepository } from './repository';
import {
  Appointment,
  AppointmentSlot,
  CancelAppointmentInput,
  CheckAvailableSlotsInput,
  ConfirmAppointmentInput,
  ReserveSlotInput,
} from './types';

export async function checkAvailableSlots(input: CheckAvailableSlotsInput): Promise<{
  success: boolean;
  slots: AppointmentSlot[];
}> {
  try {
    const slots = await schedulingRepository.checkAvailableSlots(input);
    return { success: true, slots };
  } catch (error) {
    logger.error('Tool check_available_slots failed', error as Error);
    return { success: false, slots: [] };
  }
}

export async function reserveSlot(input: ReserveSlotInput): Promise<{
  success: boolean;
  appointment?: Appointment;
  message: string;
}> {
  try {
    const appointment = await schedulingRepository.reserveSlot(input);
    return {
      success: true,
      appointment,
      message: 'Slot reserved temporarily',
    };
  } catch (error) {
    logger.error('Tool reserve_slot failed', error as Error);
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}

export async function confirmAppointment(input: ConfirmAppointmentInput): Promise<{
  success: boolean;
  appointment?: Appointment;
  message: string;
}> {
  try {
    const appointment = await schedulingRepository.confirmAppointment(input);
    return {
      success: true,
      appointment,
      message: 'Appointment confirmed',
    };
  } catch (error) {
    logger.error('Tool confirm_appointment failed', error as Error);
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}

export async function cancelAppointment(input: CancelAppointmentInput): Promise<{
  success: boolean;
  appointment?: Appointment;
  message: string;
}> {
  try {
    const appointment = await schedulingRepository.cancelAppointment(input);
    return {
      success: true,
      appointment,
      message: 'Appointment cancelled',
    };
  } catch (error) {
    logger.error('Tool cancel_appointment failed', error as Error);
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}

export async function rescheduleAppointment(input: CancelAppointmentInput & ReserveSlotInput): Promise<{
  success: boolean;
  appointment?: Appointment;
  message: string;
}> {
  const cancelled = await cancelAppointment({ appointmentId: input.appointmentId, reason: input.reason });
  if (!cancelled.success) {
    return cancelled;
  }

  return reserveSlot(input);
}

export const schedulingTools = {
  check_available_slots: checkAvailableSlots,
  reserve_slot: reserveSlot,
  confirm_appointment: confirmAppointment,
  cancel_appointment: cancelAppointment,
  reschedule_appointment: rescheduleAppointment,
};

export type SchedulingToolName = keyof typeof schedulingTools;
