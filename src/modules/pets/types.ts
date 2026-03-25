// Pet entity for Phase 2

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

// Valid species values
export const VALID_SPECIES = ['cachorro', 'gato', 'pássaro', 'roedor', 'outro'] as const;
export type ValidSpecies = typeof VALID_SPECIES[number];

// DB row type (snake_case from PostgreSQL)
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

// Mapper from DB row to entity
export function mapRowToPet(row: PetRow): Pet {
  return {
    id: row.id,
    chatwootId: row.chatwoot_id,
    contactId: row.contact_id,
    name: row.name,
    species: row.species,
    breed: row.breed,
    birthDate: row.birth_date,
    ageYears: row.age_years,
    ageMonths: row.age_months,
    gender: row.gender,
    weight: row.weight ? parseFloat(row.weight.toString()) : null,
    color: row.color,
    microchip: row.microchip,
    vaccinationStatus: row.vaccination_status,
    medicalConditions: row.medical_conditions,
    behaviorNotes: row.behavior_notes,
    photoUrl: row.photo_url,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}