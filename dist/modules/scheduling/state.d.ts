export type SchedulingStage = 'idle' | 'collecting_details' | 'checking_availability' | 'waiting_slot_confirmation' | 'reserved' | 'confirmed' | 'cancelled';
export interface SchedulingConversationState {
    stage: SchedulingStage;
    appointmentId?: string;
    slotId?: string;
    serviceId?: string;
    petName?: string;
    lastIntent?: string;
    updatedAt: string;
}
export interface SchedulingStateMachineResult {
    handled: boolean;
    message?: string;
    stage?: SchedulingStage;
    appointmentId?: string;
}
export declare function getSchedulingState(conversationId: string): Promise<SchedulingConversationState | null>;
export declare function setSchedulingState(conversationId: string, state: Omit<SchedulingConversationState, 'updatedAt'>, ttlSeconds?: number): Promise<void>;
export declare function markSchedulingIntent(conversationId: string, intent: string, petName?: string): Promise<SchedulingConversationState | null>;
export declare function handleSchedulingStateMachine(conversationId: string, message: string): Promise<SchedulingStateMachineResult>;
//# sourceMappingURL=state.d.ts.map