// Contact entity for Phase 2

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

// DB row type (snake_case from PostgreSQL)
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

// Mapper from DB row to entity
export function mapRowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    chatwootId: row.chatwoot_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    address: row.address,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    cpf: row.cpf,
    preferredChannel: row.preferred_channel,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}