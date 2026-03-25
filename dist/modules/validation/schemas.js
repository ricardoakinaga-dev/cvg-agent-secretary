"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatwootWebhookSchema = exports.UpdatePetSchema = exports.PetSchema = exports.PET_SPECIES = exports.UpdateMemorySchema = exports.MemorySchema = exports.MEMORY_SOURCES = exports.MEMORY_CATEGORIES = exports.ContactSearchSchema = exports.UpdateContactSchema = exports.ContactSchema = void 0;
exports.validateInput = validateInput;
const zod_1 = require("zod");
exports.ContactSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required').max(255),
    email: zod_1.z.string().email('Invalid email').optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().optional(),
    whatsapp: zod_1.z.string().optional(),
    chatwootId: zod_1.z.number().optional(),
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
    postalCode: zod_1.z.string().optional(),
    cpf: zod_1.z.string().optional(),
    preferredChannel: zod_1.z.enum(['chatwoot', 'whatsapp', 'telegram', 'email']).optional(),
    notes: zod_1.z.string().optional(),
});
exports.UpdateContactSchema = exports.ContactSchema.partial().extend({
    deletedAt: zod_1.z.date().optional(),
});
exports.ContactSearchSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    email: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    chatwootId: zod_1.z.number().optional(),
});
exports.MEMORY_CATEGORIES = [
    'preference',
    'fact',
    'history',
    'complaint',
    'feedback',
    'instruction',
];
exports.MEMORY_SOURCES = ['conversation', 'manual', 'imported', 'inferred'];
exports.MemorySchema = zod_1.z.object({
    contactId: zod_1.z.string().uuid('Invalid contact ID'),
    petId: zod_1.z.string().uuid('Invalid pet ID').optional(),
    conversationId: zod_1.z.string().uuid('Invalid conversation ID').optional(),
    category: zod_1.z.enum(exports.MEMORY_CATEGORIES),
    key: zod_1.z.string().min(1).max(255),
    value: zod_1.z.unknown(),
    confidence: zod_1.z.number().min(0).max(1),
    source: zod_1.z.enum(exports.MEMORY_SOURCES),
});
exports.UpdateMemorySchema = zod_1.z.object({
    value: zod_1.z.unknown().optional(),
    confidence: zod_1.z.number().min(0).max(1).optional(),
    source: zod_1.z.enum(exports.MEMORY_SOURCES).optional(),
    isActive: zod_1.z.boolean().optional(),
    lastConfirmedAt: zod_1.z.date().optional(),
});
exports.PET_SPECIES = ['cachorro', 'gato', 'pássaro', 'coelho', 'hamster', 'peixe', 'réptil', 'outro'];
exports.PetSchema = zod_1.z.object({
    contactId: zod_1.z.string().uuid('Invalid contact ID'),
    name: zod_1.z.string().min(1).max(255),
    species: zod_1.z.enum(exports.PET_SPECIES),
    breed: zod_1.z.string().optional(),
    birthDate: zod_1.z.date().optional(),
    ageYears: zod_1.z.number().min(0).max(30).optional(),
    ageMonths: zod_1.z.number().min(0).max(11).optional(),
    gender: zod_1.z.enum(['macho', 'fêmea', 'desconhecido']).optional(),
    weight: zod_1.z.number().positive().optional(),
    color: zod_1.z.string().optional(),
    microchip: zod_1.z.string().optional(),
    vaccinationStatus: zod_1.z.string().optional(),
    medicalConditions: zod_1.z.string().optional(),
    behaviorNotes: zod_1.z.string().optional(),
    photoUrl: zod_1.z.string().url().optional(),
    chatwootId: zod_1.z.number().optional(),
});
exports.UpdatePetSchema = exports.PetSchema.partial().extend({
    isActive: zod_1.z.boolean().optional(),
    deletedAt: zod_1.z.date().optional(),
});
exports.ChatwootWebhookSchema = zod_1.z.object({
    event: zod_1.z.enum([
        'message_created',
        'message_updated',
        'conversation_created',
        'conversation_status_changed',
        'conversation_updated',
    ]),
    conversation: zod_1.z.object({
        id: zod_1.z.number(),
        uuid: zod_1.z.string(),
        account_id: zod_1.z.number(),
        inbox_id: zod_1.z.number(),
        status: zod_1.z.string(),
        contact: zod_1.z.object({
            id: zod_1.z.number(),
            name: zod_1.z.string(),
            email: zod_1.z.string().optional(),
            phone: zod_1.z.string().optional(),
        }),
    }),
    message: zod_1.z.object({
        id: zod_1.z.number(),
        content: zod_1.z.string().optional(),
        message_type: zod_1.z.number(),
    }).optional(),
});
function validateInput(schema, data) {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
    return { success: false, errors };
}
//# sourceMappingURL=schemas.js.map