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

const CHATWOOT_MAX_CONTENT_LENGTH = 10_000;
const CHATWOOT_MAX_ATTACHMENTS = 10;

const ChatwootContactSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(255),
  email: z.string().max(320).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  phone_number: z.string().max(64).nullable().optional(),
  identifier: z.string().max(255).nullable().optional(),
}).strip();

const ChatwootSenderSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(255),
  type: z.enum(['contact', 'agent', 'bot', 'user']),
}).strip();

// Account webhooks emitted by Chatwoot omit `type` on the flat, top-level
// sender even though nested message payloads include it.
const ChatwootTopLevelSenderSchema = ChatwootSenderSchema.extend({
  type: z.enum(['contact', 'agent', 'bot', 'user']).optional(),
}).strip();

const ChatwootAttachmentSchema = z.object({
  id: z.number().int().positive(),
  external_url: z.string().url().max(2048).optional(),
  file_url: z.string().url().max(2048).optional(),
  filename: z.string().max(255),
  content_type: z.string().max(255),
}).strip();

const ChatwootMessageSchema = z.object({
  id: z.number().int().positive(),
  content: z.string().max(CHATWOOT_MAX_CONTENT_LENGTH).optional(),
  message_type: z.union([z.enum(['incoming', 'outgoing']), z.literal(0), z.literal(1)]),
  private: z.boolean().optional(),
  sender: ChatwootSenderSchema,
  attachments: z.array(ChatwootAttachmentSchema).max(CHATWOOT_MAX_ATTACHMENTS).optional(),
}).strip();

export const ChatwootWebhookSchema = z.object({
  event: z.enum([
    'message_created',
    'message_updated',
    'conversation_created',
    'conversation_status_changed',
    'conversation_updated',
  ]),
  conversation: z.object({
    id: z.number().int().positive(),
    uuid: z.string().max(255).optional(),
    account_id: z.number().int().positive().optional(),
    inbox_id: z.number().int().positive(),
    status: z.enum(['open', 'pending', 'resolved', 'closed']),
    contact: ChatwootContactSchema.optional(),
    meta: z.object({
      sender: ChatwootContactSchema.optional(),
    }).strip().optional(),
  }).strip(),
  message: ChatwootMessageSchema.optional(),
  id: z.number().int().positive().optional(),
  content: z.string().max(CHATWOOT_MAX_CONTENT_LENGTH).optional(),
  message_type: z.union([z.enum(['incoming', 'outgoing']), z.literal(0), z.literal(1)]).optional(),
  private: z.boolean().optional(),
  sender: ChatwootTopLevelSenderSchema.optional(),
  attachments: z.array(ChatwootAttachmentSchema).max(CHATWOOT_MAX_ATTACHMENTS).optional(),
  account: z.object({
    id: z.number().int().positive(),
    name: z.string().max(255).optional(),
  }).strip().optional(),
}).strip().superRefine((payload, context) => {
  const conversationAccountId = payload.conversation.account_id;
  const topLevelAccountId = payload.account?.id;
  if (conversationAccountId === undefined && topLevelAccountId === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'account is required',
      path: ['conversation', 'account_id'],
    });
  } else if (
    conversationAccountId !== undefined
    && topLevelAccountId !== undefined
    && conversationAccountId !== topLevelAccountId
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'account values must match',
      path: ['account', 'id'],
    });
  }

  const isFlatIncomingMessage = payload.message_type === 'incoming' || payload.message_type === 0;
  const contact = payload.conversation.contact
    || payload.conversation.meta?.sender
    || (
      payload.sender
      && (
        isFlatIncomingMessage
        || payload.sender.type === 'contact'
        || payload.sender.type === 'user'
      )
        ? payload.sender
        : undefined
    );
  if (!contact) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'contact sender is required',
      path: ['conversation', 'contact'],
    });
  }

  if (
    ['message_created', 'message_updated'].includes(payload.event)
    && !payload.message
    && (payload.id === undefined || payload.message_type === undefined || payload.sender === undefined)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'message event requires message or top-level id/message_type/sender',
      path: ['message'],
    });
  }
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
