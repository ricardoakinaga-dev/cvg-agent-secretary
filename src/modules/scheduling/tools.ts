import { logger } from '../logging';
import { schedulingRepository } from './repository';
import {
  Appointment,
  AppointmentSlot,
  CancelAppointmentInput,
  CheckAvailableSlotsInput,
  ConfirmAppointmentInput,
  RescheduleAppointmentInput,
  ReserveSlotInput,
} from './types';

function hasOwnership(
  input: { conversationId?: string; contactId?: string }
): input is { conversationId: string; contactId: string } {
  return Boolean(input.conversationId?.trim() && input.contactId?.trim());
}

function ownershipFailure(): { success: false; message: string } {
  return {
    success: false,
    message: 'Appointment ownership context is required',
  };
}

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
  if (!hasOwnership(input)) {
    return ownershipFailure();
  }

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
      message: 'Unable to reserve slot',
    };
  }
}

export async function confirmAppointment(input: ConfirmAppointmentInput): Promise<{
  success: boolean;
  appointment?: Appointment;
  message: string;
}> {
  if (!hasOwnership(input)) {
    return ownershipFailure();
  }

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
      message: 'Unable to confirm appointment',
    };
  }
}

export async function cancelAppointment(input: CancelAppointmentInput): Promise<{
  success: boolean;
  appointment?: Appointment;
  message: string;
}> {
  if (!hasOwnership(input)) {
    return ownershipFailure();
  }

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
      message: 'Unable to cancel appointment',
    };
  }
}

export async function rescheduleAppointment(input: RescheduleAppointmentInput): Promise<{
  success: boolean;
  appointment?: Appointment;
  message: string;
}> {
  if (!hasOwnership(input)) {
    return ownershipFailure();
  }

  try {
    const appointment = await schedulingRepository.rescheduleAppointment(input);
    return {
      success: true,
      appointment,
      message: 'Appointment rescheduled',
    };
  } catch (error) {
    logger.error('Tool reschedule_appointment failed', error as Error);
    return {
      success: false,
      message: 'Unable to reschedule appointment',
    };
  }
}

export const schedulingTools = {
  check_available_slots: checkAvailableSlots,
  reserve_slot: reserveSlot,
  confirm_appointment: confirmAppointment,
  cancel_appointment: cancelAppointment,
  reschedule_appointment: rescheduleAppointment,
};

export type SchedulingToolName = keyof typeof schedulingTools;
