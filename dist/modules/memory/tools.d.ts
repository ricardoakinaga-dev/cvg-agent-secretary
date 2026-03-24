import { CreateContactInput, ContactSearchInput } from '../contacts/types.js';
import { CreatePetInput, PetSearchInput } from '../pets/types.js';
import { CreateMemoryInput, MemorySearchInput } from './types.js';
import { CreateSummaryInput } from '../summaries/types.js';
export declare function findContact(input: ContactSearchInput): Promise<{
    found: boolean;
    contact: any | null;
}>;
export declare function createOrUpdateContact(input: CreateContactInput & {
    contactId?: string;
}): Promise<{
    success: boolean;
    contact: any;
}>;
export declare function findPet(input: PetSearchInput): Promise<{
    found: boolean;
    pets: any[];
}>;
export declare function createOrUpdatePet(input: CreatePetInput & {
    petId?: string;
}): Promise<{
    success: boolean;
    pet: any;
}>;
export declare function saveMemory(input: CreateMemoryInput): Promise<{
    success: boolean;
    memoryId: string;
}>;
export declare function listMemories(input: MemorySearchInput): Promise<{
    memories: any[];
}>;
export declare function logSummary(input: CreateSummaryInput): Promise<{
    success: boolean;
    summaryId: string;
}>;
export declare const memoryTools: {
    find_contact: typeof findContact;
    create_or_update_contact: typeof createOrUpdateContact;
    find_pet: typeof findPet;
    create_or_update_pet: typeof createOrUpdatePet;
    save_memory: typeof saveMemory;
    list_memories: typeof listMemories;
    log_summary: typeof logSummary;
};
export type MemoryToolName = keyof typeof memoryTools;
//# sourceMappingURL=tools.d.ts.map