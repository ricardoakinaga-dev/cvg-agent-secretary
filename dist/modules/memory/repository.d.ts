import { Memory, CreateMemoryInput, UpdateMemoryInput, MemorySearchInput } from './types.js';
export declare class MemoryRepository {
    /**
     * List memories by various search criteria
     */
    find(input: MemorySearchInput): Promise<Memory[]>;
    /**
     * Find a memory by ID
     */
    findById(id: string): Promise<Memory | null>;
    /**
     * Create a new memory
     * Note: Will deactivate conflicting facts with same contact+category+key
     */
    create(input: CreateMemoryInput): Promise<Memory>;
    /**
     * Update an existing memory
     */
    update(id: string, input: UpdateMemoryInput): Promise<Memory>;
    /**
     * Deactivate a memory (soft delete)
     */
    deactivate(id: string): Promise<void>;
    /**
     * Get memories for a contact formatted for LLM context
     */
    getContextForLLM(contactId: string): Promise<string[]>;
}
export declare const memoryRepository: MemoryRepository;
//# sourceMappingURL=repository.d.ts.map