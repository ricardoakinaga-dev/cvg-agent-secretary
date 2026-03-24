export interface Contact {
    id: string;
    chatwootId: number | null;
    name: string;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    cpf: string | null;
    preferredChannel: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
export interface CreateContactInput {
    chatwootId?: number;
    name: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    cpf?: string;
    preferredChannel?: string;
    notes?: string;
}
export interface UpdateContactInput {
    name?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    cpf?: string;
    preferredChannel?: string;
    notes?: string;
    deletedAt?: Date;
}
export interface ContactSearchInput {
    phone?: string;
    email?: string;
    name?: string;
    chatwootId?: number;
}
export interface ContactRow {
    id: string;
    chatwoot_id: number | null;
    name: string;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    cpf: string | null;
    preferred_channel: string;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
export declare function mapRowToContact(row: ContactRow): Contact;
//# sourceMappingURL=types.d.ts.map