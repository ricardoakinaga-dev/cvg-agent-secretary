import { Pet, CreatePetInput, UpdatePetInput, PetSearchInput } from './types.js';
export declare class PetRepository {
    /**
     * Find pets by various search criteria
     */
    find(input: PetSearchInput): Promise<Pet[]>;
    /**
     * Find a pet by ID
     */
    findById(id: string): Promise<Pet | null>;
    /**
     * Create a new pet
     */
    create(input: CreatePetInput): Promise<Pet>;
    /**
     * Create or update a pet based on existence
     */
    createOrUpdate(input: CreatePetInput & {
        id?: string;
    }): Promise<Pet>;
    /**
     * Update an existing pet
     */
    update(id: string, input: UpdatePetInput): Promise<Pet>;
    /**
     * Soft delete a pet
     */
    delete(id: string): Promise<void>;
}
export declare const petRepository: PetRepository;
//# sourceMappingURL=repository.d.ts.map