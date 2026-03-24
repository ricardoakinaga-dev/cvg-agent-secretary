export interface Pet {
    id: string;
    chatwootId: number | null;
    contactId: string;
    name: string;
    species: string;
    breed: string | null;
    birthDate: Date | null;
    ageYears: number | null;
    ageMonths: number | null;
    gender: string | null;
    weight: number | null;
    color: string | null;
    microchip: string | null;
    vaccinationStatus: string | null;
    medicalConditions: string | null;
    behaviorNotes: string | null;
    photoUrl: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
export interface CreatePetInput {
    chatwootId?: number;
    contactId: string;
    name: string;
    species: string;
    breed?: string;
    birthDate?: Date;
    ageYears?: number;
    ageMonths?: number;
    gender?: string;
    weight?: number;
    color?: string;
    microchip?: string;
    vaccinationStatus?: string;
    medicalConditions?: string;
    behaviorNotes?: string;
    photoUrl?: string;
}
export interface UpdatePetInput {
    name?: string;
    species?: string;
    breed?: string;
    birthDate?: Date;
    ageYears?: number;
    ageMonths?: number;
    gender?: string;
    weight?: number;
    color?: string;
    microchip?: string;
    vaccinationStatus?: string;
    medicalConditions?: string;
    behaviorNotes?: string;
    photoUrl?: string;
    isActive?: boolean;
    deletedAt?: Date;
}
export interface PetSearchInput {
    name?: string;
    contactId?: string;
    petId?: string;
    species?: string;
}
export declare const VALID_SPECIES: readonly ["cachorro", "gato", "pássaro", "roedor", "outro"];
export type ValidSpecies = typeof VALID_SPECIES[number];
export interface PetRow {
    id: string;
    chatwoot_id: number | null;
    contact_id: string;
    name: string;
    species: string;
    breed: string | null;
    birth_date: Date | null;
    age_years: number | null;
    age_months: number | null;
    gender: string | null;
    weight: number | null;
    color: string | null;
    microchip: string | null;
    vaccination_status: string | null;
    medical_conditions: string | null;
    behavior_notes: string | null;
    photo_url: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
export declare function mapRowToPet(row: PetRow): Pet;
//# sourceMappingURL=types.d.ts.map