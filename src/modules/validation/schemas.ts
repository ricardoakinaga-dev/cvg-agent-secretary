import { z } from 'zod';

export const ContactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  chatwootId: z.number().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  cpf: z.string().optional(),
  preferredChannel: z.enum(['chatwoot', 'whatsapp', 'telegram', 'email']).optional(),
  notes: z.string().optional(),
});

export type CreateContactInput = z.infer<typeof ContactSchema>;

export const UpdateContactSchema = ContactSchema.partial().extend({
  deletedAt: z.date().optional(),
});

export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;

export const ContactSearchSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  chatwootId: z.number().optional(),
});

export type ContactSearchInput = z.infer<typeof ContactSearchSchema>;

export const MEMORY_CATEGORIES = [
  'preference',
  'fact',
  'history',
  'complaint',
  'feedback',
  'instruction',
] as const;

export const MEMORY_SOURCES = ['conversation', 'manual', 'imported', 'inferred'] as const;

export const MemorySchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
  petId: z.string().uuid('Invalid pet ID').optional(),
  conversationId: z.string().uuid('Invalid conversation ID').optional(),
  category: z.enum(MEMORY_CATEGORIES),
  key: z.string().min(1).max(255),
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
  source: z.enum(MEMORY_SOURCES),
});

export type CreateMemoryInput = z.infer<typeof MemorySchema>;

export const UpdateMemorySchema = z.object({
  value: z.unknown().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(MEMORY_SOURCES).optional(),
  isActive: z.boolean().optional(),
  lastConfirmedAt: z.date().optional(),
});

export type UpdateMemoryInput = z.infer<typeof UpdateMemorySchema>;

export const PET_SPECIES = ['cachorro', 'gato', 'pássaro', 'coelho', 'hamster', 'peixe', 'réptil', 'outro'] as const;

export const PetSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
  name: z.string().min(1).max(255),
  species: z.enum(PET_SPECIES),
  breed: z.string().optional(),
  birthDate: z.date().optional(),
  ageYears: z.number().min(0).max(30).optional(),
  ageMonths: z.number().min(0).max(11).optional(),
  gender: z.enum(['macho', 'fêmea', 'desconhecido']).optional(),
  weight: z.number().positive().optional(),
  color: z.string().optional(),
  microchip: z.string().optional(),
  vaccinationStatus: z.string().optional(),
  medicalConditions: z.string().optional(),
  behaviorNotes: z.string().optional(),
  photoUrl: z.string().url().optional(),
  chatwootId: z.number().optional(),
});

export type CreatePetInput = z.infer<typeof PetSchema>;

export const UpdatePetSchema = PetSchema.partial().extend({
  isActive: z.boolean().optional(),
  deletedAt: z.date().optional(),
});

export type UpdatePetInput = z.infer<typeof UpdatePetSchema>;

export const ChatwootWebhookSchema = z.object({
  event: z.enum([
    'message_created',
    'message_updated',
    'conversation_created',
    'conversation_status_changed',
    'conversation_updated',
  ]),
  conversation: z.object({
    id: z.number(),
    uuid: z.string(),
    account_id: z.number(),
    inbox_id: z.number(),
    status: z.string(),
    contact: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
    }),
  }),
  message: z.object({
    id: z.number(),
    content: z.string().optional(),
    message_type: z.number(),
  }).optional(),
});

export type ChatwootWebhookPayload = z.infer<typeof ChatwootWebhookSchema>;

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  errors?: string[];
} {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map(err => 
    `${err.path.join('.')}: ${err.message}`
  );
  
  return { success: false, errors };
}
