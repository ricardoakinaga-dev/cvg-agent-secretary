// Agent Tools for Memory Management
// These tools will be called by the LLM during conversations

import { contactRepository } from '../contacts/repository.js';
import { petRepository } from '../pets/repository.js';
import { memoryRepository } from './repository.js';
import { summaryRepository } from '../summaries/repository.js';
import { logger } from '../logging/index.js';
import { 
  CreateContactInput, 
  ContactSearchInput,
  Contact 
} from '../contacts/types.js';
import { 
  CreatePetInput, 
  PetSearchInput,
  Pet
} from '../pets/types.js';
import { 
  CreateMemoryInput, 
  MemorySearchInput,
  Memory,
} from './types.js';
import { CreateSummaryInput } from '../summaries/types.js';

// Tool: find_contact
export async function findContact(input: ContactSearchInput): Promise<{
  found: boolean;
  contact: Partial<Contact> | null;
}> {
  try {
    const contact = await contactRepository.find(input);
    return {
      found: !!contact,
      contact: contact ? {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        preferredChannel: contact.preferredChannel,
      } : null,
    };
  } catch (error) {
    logger.error('Tool find_contact failed', error as Error);
    throw error;
  }
}

// Tool: create_or_update_contact
export async function createOrUpdateContact(input: CreateContactInput & { 
  contactId?: string 
}): Promise<{
  success: boolean;
  contact: Partial<Contact>;
}> {
  try {
    const contact = await contactRepository.createOrUpdate(input);
    return {
      success: true,
      contact: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        preferredChannel: contact.preferredChannel,
      },
    };
  } catch (error) {
    logger.error('Tool create_or_update_contact failed', error as Error);
    throw error;
  }
}

// Tool: find_pet
export async function findPet(input: PetSearchInput): Promise<{
  found: boolean;
  pets: Partial<Pet>[];
}> {
  try {
    const pets = await petRepository.find(input);
    return {
      found: pets.length > 0,
      pets: pets.map(p => ({
        id: p.id,
        name: p.name,
        species: p.species,
        breed: p.breed,
        ageYears: p.ageYears,
        gender: p.gender,
      })),
    };
  } catch (error) {
    logger.error('Tool find_pet failed', error as Error);
    throw error;
  }
}

// Tool: create_or_update_pet
export async function createOrUpdatePet(input: CreatePetInput & { 
  petId?: string 
}): Promise<{
  success: boolean;
  pet: Partial<Pet>;
}> {
  try {
    // Validate required fields
    if (!input.contactId || !input.name || !input.species) {
      throw new Error('contactId, name, and species are required');
    }

    const pet = await petRepository.createOrUpdate(input);
    return {
      success: true,
      pet: {
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        ageYears: pet.ageYears,
        gender: pet.gender,
      },
    };
  } catch (error) {
    logger.error('Tool create_or_update_pet failed', error as Error);
    throw error;
  }
}

// Tool: save_memory
export async function saveMemory(input: CreateMemoryInput): Promise<{
  success: boolean;
  memoryId: string;
}> {
  try {
    // Validate required fields
    if (!input.contactId || !input.category || !input.key) {
      throw new Error('contactId, category, and key are required');
    }

    // Validate confidence
    if (input.confidence < 0 || input.confidence > 1) {
      throw new Error('confidence must be between 0 and 1');
    }

    const memory = await memoryRepository.create(input);
    return {
      success: true,
      memoryId: memory.id,
    };
  } catch (error) {
    logger.error('Tool save_memory failed', error as Error);
    throw error;
  }
}

// Tool: list_memories
export async function listMemories(input: MemorySearchInput): Promise<{
  memories: Partial<Memory>[];
}> {
  try {
    const memories = await memoryRepository.find(input);
    return {
      memories: memories.map(m => ({
        id: m.id,
        category: m.category,
        key: m.key,
        value: m.value,
        confidence: m.confidence,
        source: m.source,
        updatedAt: m.updatedAt,
      })),
    };
  } catch (error) {
    logger.error('Tool list_memories failed', error as Error);
    throw error;
  }
}

// Tool: log_summary
export async function logSummary(input: CreateSummaryInput): Promise<{
  success: boolean;
  summaryId: string;
}> {
  try {
    // Validate required fields
    if (!input.conversationId || !input.summaryText) {
      throw new Error('conversationId and summaryText are required');
    }

    const summary = await summaryRepository.create(input);
    return {
      success: true,
      summaryId: summary.id,
    };
  } catch (error) {
    logger.error('Tool log_summary failed', error as Error);
    throw error;
  }
}

// Export all tools as a registry for the agent runtime
export const memoryTools = {
  find_contact: findContact,
  create_or_update_contact: createOrUpdateContact,
  find_pet: findPet,
  create_or_update_pet: createOrUpdatePet,
  save_memory: saveMemory,
  list_memories: listMemories,
  log_summary: logSummary,
};

export type MemoryToolName = keyof typeof memoryTools;