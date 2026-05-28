export type AppointmentSlotStatus = 'available' | 'reserved' | 'booked' | 'blocked';
export type AppointmentStatus = 'reserved' | 'confirmed' | 'cancelled' | 'completed' | 'expired';

export interface AppointmentSlot {
  id: string;
  serviceId: string | null;
  providerId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentSlotStatus;
  serviceName?: string;
  providerName?: string;
  metadata?: Record<string, unknown>;
}

export interface AppointmentService {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  requiresHumanApproval: boolean;
  isActive: boolean;
}

export interface AppointmentProvider {
  id: string;
  name: string;
  sector?: string;
  isActive: boolean;
}

export interface CreateAppointmentServiceInput {
  name: string;
  description?: string;
  durationMinutes?: number;
  requiresHumanApproval?: boolean;
}

export interface CreateAppointmentProviderInput {
  name: string;
  sector?: string;
}

export interface CreateAppointmentSlotInput {
  serviceId?: string;
  providerId?: string;
  startsAt: Date;
  endsAt: Date;
  status?: AppointmentSlotStatus;
  metadata?: Record<string, unknown>;
}

export interface Appointment {
  id: string;
  slotId: string;
  serviceId: string | null;
  providerId: string | null;
  conversationId?: string;
  contactId?: string;
  petId?: string;
  tutorName?: string;
  petName?: string;
  reason?: string;
  status: AppointmentStatus;
  reservationExpiresAt?: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
}

export interface CheckAvailableSlotsInput {
  serviceId?: string;
  from: Date;
  to: Date;
  limit?: number;
}

export interface ReserveSlotInput {
  slotId: string;
  serviceId?: string;
  conversationId?: string;
  contactId?: string;
  petId?: string;
  tutorName?: string;
  petName?: string;
  reason?: string;
  holdMinutes?: number;
}

export interface ConfirmAppointmentInput {
  appointmentId: string;
}

export interface CancelAppointmentInput {
  appointmentId: string;
  reason?: string;
}
