import { Contact, CreateContactInput, UpdateContactInput, ContactSearchInput } from './types.js';
export declare class ContactRepository {
    /**
     * Find a contact by various search criteria
     */
    find(input: ContactSearchInput): Promise<Contact | null>;
    /**
     * Find a contact by ID
     */
    findById(id: string): Promise<Contact | null>;
    /**
     * Create a new contact
     */
    create(input: CreateContactInput): Promise<Contact>;
    /**
     * Create or update a contact based on existence
     */
    createOrUpdate(input: CreateContactInput & {
        id?: string;
    }): Promise<Contact>;
    /**
     * Update an existing contact
     */
    update(id: string, input: UpdateContactInput): Promise<Contact>;
    /**
     * Soft delete a contact
     */
    delete(id: string): Promise<void>;
}
export declare const contactRepository: ContactRepository;
//# sourceMappingURL=repository.d.ts.map