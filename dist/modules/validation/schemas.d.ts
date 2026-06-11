import { z } from 'zod';
export declare const ContactSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    phone: z.ZodOptional<z.ZodString>;
    whatsapp: z.ZodOptional<z.ZodString>;
    chatwootId: z.ZodOptional<z.ZodNumber>;
    address: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    postalCode: z.ZodOptional<z.ZodString>;
    cpf: z.ZodOptional<z.ZodString>;
    preferredChannel: z.ZodOptional<z.ZodEnum<["chatwoot", "whatsapp", "telegram", "email"]>>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    cpf?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
    chatwootId?: number | undefined;
    whatsapp?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    notes?: string | undefined;
    postalCode?: string | undefined;
    preferredChannel?: "chatwoot" | "email" | "telegram" | "whatsapp" | undefined;
}, {
    name: string;
    cpf?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
    chatwootId?: number | undefined;
    whatsapp?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    notes?: string | undefined;
    postalCode?: string | undefined;
    preferredChannel?: "chatwoot" | "email" | "telegram" | "whatsapp" | undefined;
}>;
export type CreateContactInput = z.infer<typeof ContactSchema>;
export declare const UpdateContactSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    whatsapp: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    chatwootId: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    city: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    state: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    postalCode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    cpf: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    preferredChannel: z.ZodOptional<z.ZodOptional<z.ZodEnum<["chatwoot", "whatsapp", "telegram", "email"]>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
} & {
    deletedAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    cpf?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
    name?: string | undefined;
    chatwootId?: number | undefined;
    whatsapp?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    notes?: string | undefined;
    postalCode?: string | undefined;
    preferredChannel?: "chatwoot" | "email" | "telegram" | "whatsapp" | undefined;
    deletedAt?: Date | undefined;
}, {
    cpf?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
    name?: string | undefined;
    chatwootId?: number | undefined;
    whatsapp?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    notes?: string | undefined;
    postalCode?: string | undefined;
    preferredChannel?: "chatwoot" | "email" | "telegram" | "whatsapp" | undefined;
    deletedAt?: Date | undefined;
}>;
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;
export declare const ContactSearchSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    chatwootId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    phone?: string | undefined;
    email?: string | undefined;
    name?: string | undefined;
    chatwootId?: number | undefined;
}, {
    phone?: string | undefined;
    email?: string | undefined;
    name?: string | undefined;
    chatwootId?: number | undefined;
}>;
export type ContactSearchInput = z.infer<typeof ContactSearchSchema>;
export declare const MEMORY_CATEGORIES: readonly ["preference", "fact", "history", "complaint", "feedback", "instruction"];
export declare const MEMORY_SOURCES: readonly ["conversation", "manual", "imported", "inferred"];
export declare const MemorySchema: z.ZodObject<{
    contactId: z.ZodString;
    petId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
    category: z.ZodEnum<["preference", "fact", "history", "complaint", "feedback", "instruction"]>;
    key: z.ZodString;
    value: z.ZodUnknown;
    confidence: z.ZodNumber;
    source: z.ZodEnum<["conversation", "manual", "imported", "inferred"]>;
}, "strip", z.ZodTypeAny, {
    key: string;
    contactId: string;
    category: "fact" | "preference" | "history" | "complaint" | "instruction" | "feedback";
    source: "conversation" | "manual" | "imported" | "inferred";
    confidence: number;
    value?: unknown;
    conversationId?: string | undefined;
    petId?: string | undefined;
}, {
    key: string;
    contactId: string;
    category: "fact" | "preference" | "history" | "complaint" | "instruction" | "feedback";
    source: "conversation" | "manual" | "imported" | "inferred";
    confidence: number;
    value?: unknown;
    conversationId?: string | undefined;
    petId?: string | undefined;
}>;
export type CreateMemoryInput = z.infer<typeof MemorySchema>;
export declare const UpdateMemorySchema: z.ZodObject<{
    value: z.ZodOptional<z.ZodUnknown>;
    confidence: z.ZodOptional<z.ZodNumber>;
    source: z.ZodOptional<z.ZodEnum<["conversation", "manual", "imported", "inferred"]>>;
    isActive: z.ZodOptional<z.ZodBoolean>;
    lastConfirmedAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    value?: unknown;
    source?: "conversation" | "manual" | "imported" | "inferred" | undefined;
    isActive?: boolean | undefined;
    confidence?: number | undefined;
    lastConfirmedAt?: Date | undefined;
}, {
    value?: unknown;
    source?: "conversation" | "manual" | "imported" | "inferred" | undefined;
    isActive?: boolean | undefined;
    confidence?: number | undefined;
    lastConfirmedAt?: Date | undefined;
}>;
export type UpdateMemoryInput = z.infer<typeof UpdateMemorySchema>;
export declare const PET_SPECIES: readonly ["cachorro", "gato", "pássaro", "coelho", "hamster", "peixe", "réptil", "outro"];
export declare const PetSchema: z.ZodObject<{
    contactId: z.ZodString;
    name: z.ZodString;
    species: z.ZodEnum<["cachorro", "gato", "pássaro", "coelho", "hamster", "peixe", "réptil", "outro"]>;
    breed: z.ZodOptional<z.ZodString>;
    birthDate: z.ZodOptional<z.ZodDate>;
    ageYears: z.ZodOptional<z.ZodNumber>;
    ageMonths: z.ZodOptional<z.ZodNumber>;
    gender: z.ZodOptional<z.ZodEnum<["macho", "fêmea", "desconhecido"]>>;
    weight: z.ZodOptional<z.ZodNumber>;
    color: z.ZodOptional<z.ZodString>;
    microchip: z.ZodOptional<z.ZodString>;
    vaccinationStatus: z.ZodOptional<z.ZodString>;
    medicalConditions: z.ZodOptional<z.ZodString>;
    behaviorNotes: z.ZodOptional<z.ZodString>;
    photoUrl: z.ZodOptional<z.ZodString>;
    chatwootId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    contactId: string;
    name: string;
    species: "cachorro" | "gato" | "pássaro" | "outro" | "coelho" | "hamster" | "peixe" | "réptil";
    chatwootId?: number | undefined;
    breed?: string | undefined;
    gender?: "macho" | "fêmea" | "desconhecido" | undefined;
    weight?: number | undefined;
    color?: string | undefined;
    microchip?: string | undefined;
    birthDate?: Date | undefined;
    ageYears?: number | undefined;
    ageMonths?: number | undefined;
    vaccinationStatus?: string | undefined;
    medicalConditions?: string | undefined;
    behaviorNotes?: string | undefined;
    photoUrl?: string | undefined;
}, {
    contactId: string;
    name: string;
    species: "cachorro" | "gato" | "pássaro" | "outro" | "coelho" | "hamster" | "peixe" | "réptil";
    chatwootId?: number | undefined;
    breed?: string | undefined;
    gender?: "macho" | "fêmea" | "desconhecido" | undefined;
    weight?: number | undefined;
    color?: string | undefined;
    microchip?: string | undefined;
    birthDate?: Date | undefined;
    ageYears?: number | undefined;
    ageMonths?: number | undefined;
    vaccinationStatus?: string | undefined;
    medicalConditions?: string | undefined;
    behaviorNotes?: string | undefined;
    photoUrl?: string | undefined;
}>;
export type CreatePetInput = z.infer<typeof PetSchema>;
export declare const UpdatePetSchema: z.ZodObject<{
    contactId: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    species: z.ZodOptional<z.ZodEnum<["cachorro", "gato", "pássaro", "coelho", "hamster", "peixe", "réptil", "outro"]>>;
    breed: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    birthDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    ageYears: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    ageMonths: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    gender: z.ZodOptional<z.ZodOptional<z.ZodEnum<["macho", "fêmea", "desconhecido"]>>>;
    weight: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    color: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    microchip: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    vaccinationStatus: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    medicalConditions: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    behaviorNotes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    photoUrl: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    chatwootId: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
} & {
    isActive: z.ZodOptional<z.ZodBoolean>;
    deletedAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    contactId?: string | undefined;
    name?: string | undefined;
    isActive?: boolean | undefined;
    chatwootId?: number | undefined;
    species?: "cachorro" | "gato" | "pássaro" | "outro" | "coelho" | "hamster" | "peixe" | "réptil" | undefined;
    breed?: string | undefined;
    gender?: "macho" | "fêmea" | "desconhecido" | undefined;
    weight?: number | undefined;
    color?: string | undefined;
    microchip?: string | undefined;
    deletedAt?: Date | undefined;
    birthDate?: Date | undefined;
    ageYears?: number | undefined;
    ageMonths?: number | undefined;
    vaccinationStatus?: string | undefined;
    medicalConditions?: string | undefined;
    behaviorNotes?: string | undefined;
    photoUrl?: string | undefined;
}, {
    contactId?: string | undefined;
    name?: string | undefined;
    isActive?: boolean | undefined;
    chatwootId?: number | undefined;
    species?: "cachorro" | "gato" | "pássaro" | "outro" | "coelho" | "hamster" | "peixe" | "réptil" | undefined;
    breed?: string | undefined;
    gender?: "macho" | "fêmea" | "desconhecido" | undefined;
    weight?: number | undefined;
    color?: string | undefined;
    microchip?: string | undefined;
    deletedAt?: Date | undefined;
    birthDate?: Date | undefined;
    ageYears?: number | undefined;
    ageMonths?: number | undefined;
    vaccinationStatus?: string | undefined;
    medicalConditions?: string | undefined;
    behaviorNotes?: string | undefined;
    photoUrl?: string | undefined;
}>;
export type UpdatePetInput = z.infer<typeof UpdatePetSchema>;
export declare const ChatwootWebhookSchema: z.ZodObject<{
    event: z.ZodEnum<["message_created", "message_updated", "conversation_created", "conversation_status_changed", "conversation_updated"]>;
    conversation: z.ZodObject<{
        id: z.ZodNumber;
        uuid: z.ZodString;
        account_id: z.ZodNumber;
        inbox_id: z.ZodNumber;
        status: z.ZodString;
        contact: z.ZodObject<{
            id: z.ZodNumber;
            name: z.ZodString;
            email: z.ZodOptional<z.ZodString>;
            phone: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id: number;
            phone?: string | undefined;
            email?: string | undefined;
        }, {
            name: string;
            id: number;
            phone?: string | undefined;
            email?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        contact: {
            name: string;
            id: number;
            phone?: string | undefined;
            email?: string | undefined;
        };
        id: number;
        status: string;
        uuid: string;
        account_id: number;
        inbox_id: number;
    }, {
        contact: {
            name: string;
            id: number;
            phone?: string | undefined;
            email?: string | undefined;
        };
        id: number;
        status: string;
        uuid: string;
        account_id: number;
        inbox_id: number;
    }>;
    message: z.ZodOptional<z.ZodObject<{
        id: z.ZodNumber;
        content: z.ZodOptional<z.ZodString>;
        message_type: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: number;
        message_type: number;
        content?: string | undefined;
    }, {
        id: number;
        message_type: number;
        content?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    conversation: {
        contact: {
            name: string;
            id: number;
            phone?: string | undefined;
            email?: string | undefined;
        };
        id: number;
        status: string;
        uuid: string;
        account_id: number;
        inbox_id: number;
    };
    event: "conversation_created" | "conversation_status_changed" | "conversation_updated" | "message_created" | "message_updated";
    message?: {
        id: number;
        message_type: number;
        content?: string | undefined;
    } | undefined;
}, {
    conversation: {
        contact: {
            name: string;
            id: number;
            phone?: string | undefined;
            email?: string | undefined;
        };
        id: number;
        status: string;
        uuid: string;
        account_id: number;
        inbox_id: number;
    };
    event: "conversation_created" | "conversation_status_changed" | "conversation_updated" | "message_created" | "message_updated";
    message?: {
        id: number;
        message_type: number;
        content?: string | undefined;
    } | undefined;
}>;
export type ChatwootWebhookPayload = z.infer<typeof ChatwootWebhookSchema>;
export declare function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: boolean;
    data?: T;
    errors?: string[];
};
//# sourceMappingURL=schemas.d.ts.map