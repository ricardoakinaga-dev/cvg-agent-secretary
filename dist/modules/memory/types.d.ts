export type MemoryCategory = 'contact_info' | 'pet_info' | 'preference' | 'history' | 'need';
export type MemorySource = 'extraction' | 'user_confirmed' | 'system' | 'update';
export interface Memory {
    id: string;
    contactId: string;
    petId: string | null;
    conversationId: string | null;
    category: MemoryCategory;
    key: string;
    value: Record<string, unknown>;
    confidence: number;
    source: MemorySource;
    isActive: boolean;
    lastConfirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
export interface CreateMemoryInput {
    contactId: string;
    petId?: string;
    conversationId?: string;
    category: MemoryCategory;
    key: string;
    value: Record<string, unknown>;
    confidence: number;
    source: MemorySource;
}
export interface UpdateMemoryInput {
    value?: Record<string, unknown>;
    confidence?: number;
    source?: MemorySource;
    isActive?: boolean;
    lastConfirmedAt?: Date;
}
export interface MemorySearchInput {
    contactId: string;
    petId?: string;
    category?: MemoryCategory;
    activeOnly?: boolean;
    key?: string;
}
export declare const CONFIDENCE_THRESHOLDS: {
    readonly AUTO_SAVE: 0.9;
    readonly IMPLICIT_CONFIRM: 0.7;
    readonly EXPLICIT_CONFIRM: 0.7;
};
export declare const VALID_CATEGORIES: MemoryCategory[];
export declare const VALID_SOURCES: MemorySource[];
export interface MemoryRow {
    id: string;
    contact_id: string;
    pet_id: string | null;
    conversation_id: string | null;
    category: string;
    key: string;
    value: Record<string, unknown>;
    confidence: number;
    source: string;
    is_active: boolean;
    last_confirmed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
export declare function mapRowToMemory(row: MemoryRow): Memory;
//# sourceMappingURL=types.d.ts.map