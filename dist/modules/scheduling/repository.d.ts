import { Appointment, AppointmentProvider, AppointmentService, AppointmentSlot, CancelAppointmentInput, CheckAvailableSlotsInput, CreateAppointmentProviderInput, CreateAppointmentServiceInput, CreateAppointmentSlotInput, ConfirmAppointmentInput, ReserveSlotInput } from './types';
export declare class SchedulingRepository {
    createService(input: CreateAppointmentServiceInput): Promise<AppointmentService>;
    listServices(): Promise<AppointmentService[]>;
    createProvider(input: CreateAppointmentProviderInput): Promise<AppointmentProvider>;
    listProviders(): Promise<AppointmentProvider[]>;
    createSlot(input: CreateAppointmentSlotInput): Promise<AppointmentSlot>;
    listSlots(input: {
        from: Date;
        to: Date;
        serviceId?: string;
        providerId?: string;
        status?: AppointmentSlot['status'];
        limit?: number;
    }): Promise<AppointmentSlot[]>;
    checkAvailableSlots(input: CheckAvailableSlotsInput): Promise<AppointmentSlot[]>;
    reserveSlot(input: ReserveSlotInput): Promise<Appointment>;
    confirmAppointment(input: ConfirmAppointmentInput): Promise<Appointment>;
    cancelAppointment(input: CancelAppointmentInput): Promise<Appointment>;
}
export declare const schedulingRepository: SchedulingRepository;
//# sourceMappingURL=repository.d.ts.map