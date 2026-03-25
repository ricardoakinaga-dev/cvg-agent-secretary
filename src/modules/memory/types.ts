// Customer Memory entity for Phase 2

export type MemoryCategory = 
  | 'contact_info' 
  | 'pet_info' 
  | 'preference' 
  | 'history' 
  | 'need';

export type MemorySource = 
  | 'extraction' 
  | 'user_confirmed' 
  | 'system' 
  | 'update';

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

// Confidence thresholds as per spec
export const CONFIDENCE_THRESHOLDS = {
  AUTO_SAVE: 0.9,      // >= 0.9: save automatically
  IMPLICIT_CONFIRM: 0.7, // 0.7-0.89: save after 1 implicit confirmation
  EXPLICIT_CONFIRM: 0.7, // < 0.7: require explicit confirmation
} as const;

// Valid categories
export const VALID_CATEGORIES: MemoryCategory[] = [
  'contact_info', 
  'pet_info', 
  'preference', 
  'history', 
  'need'
];

// Valid sources
export const VALID_SOURCES: MemorySource[] = [
  'extraction', 
  'user_confirmed', 
  'system', 
  'update'
];

// DB row type (snake_case from PostgreSQL)
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

// Mapper from DB row to entity
export function mapRowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    contactId: row.contact_id,
    petId: row.pet_id,
    conversationId: row.conversation_id,
    category: row.category as MemoryCategory,
    key: row.key,
    value: typeof row.value === 'string' ? JSON.parse(row.value) : row.value,
    confidence: parseFloat(row.confidence.toString()),
    source: row.source as MemorySource,
    isActive: row.is_active,
    lastConfirmedAt: row.last_confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}