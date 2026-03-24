"use strict";
// Agent Tools for Memory Management
// These tools will be called by the LLM during conversations
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryTools = void 0;
exports.findContact = findContact;
exports.createOrUpdateContact = createOrUpdateContact;
exports.findPet = findPet;
exports.createOrUpdatePet = createOrUpdatePet;
exports.saveMemory = saveMemory;
exports.listMemories = listMemories;
exports.logSummary = logSummary;
const repository_js_1 = require("../contacts/repository.js");
const repository_js_2 = require("../pets/repository.js");
const repository_js_3 = require("./repository.js");
const repository_js_4 = require("../summaries/repository.js");
const index_js_1 = require("../logging/index.js");
// Tool: find_contact
async function findContact(input) {
    try {
        const contact = await repository_js_1.contactRepository.find(input);
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
    }
    catch (error) {
        index_js_1.logger.error('Tool find_contact failed', error);
        throw error;
    }
}
// Tool: create_or_update_contact
async function createOrUpdateContact(input) {
    try {
        const contact = await repository_js_1.contactRepository.createOrUpdate(input);
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
    }
    catch (error) {
        index_js_1.logger.error('Tool create_or_update_contact failed', error);
        throw error;
    }
}
// Tool: find_pet
async function findPet(input) {
    try {
        const pets = await repository_js_2.petRepository.find(input);
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
    }
    catch (error) {
        index_js_1.logger.error('Tool find_pet failed', error);
        throw error;
    }
}
// Tool: create_or_update_pet
async function createOrUpdatePet(input) {
    try {
        // Validate required fields
        if (!input.contactId || !input.name || !input.species) {
            throw new Error('contactId, name, and species are required');
        }
        const pet = await repository_js_2.petRepository.createOrUpdate(input);
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
    }
    catch (error) {
        index_js_1.logger.error('Tool create_or_update_pet failed', error);
        throw error;
    }
}
// Tool: save_memory
async function saveMemory(input) {
    try {
        // Validate required fields
        if (!input.contactId || !input.category || !input.key) {
            throw new Error('contactId, category, and key are required');
        }
        // Validate confidence
        if (input.confidence < 0 || input.confidence > 1) {
            throw new Error('confidence must be between 0 and 1');
        }
        const memory = await repository_js_3.memoryRepository.create(input);
        return {
            success: true,
            memoryId: memory.id,
        };
    }
    catch (error) {
        index_js_1.logger.error('Tool save_memory failed', error);
        throw error;
    }
}
// Tool: list_memories
async function listMemories(input) {
    try {
        const memories = await repository_js_3.memoryRepository.find(input);
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
    }
    catch (error) {
        index_js_1.logger.error('Tool list_memories failed', error);
        throw error;
    }
}
// Tool: log_summary
async function logSummary(input) {
    try {
        // Validate required fields
        if (!input.conversationId || !input.summaryText) {
            throw new Error('conversationId and summaryText are required');
        }
        const summary = await repository_js_4.summaryRepository.create(input);
        return {
            success: true,
            summaryId: summary.id,
        };
    }
    catch (error) {
        index_js_1.logger.error('Tool log_summary failed', error);
        throw error;
    }
}
// Export all tools as a registry for the agent runtime
exports.memoryTools = {
    find_contact: findContact,
    create_or_update_contact: createOrUpdateContact,
    find_pet: findPet,
    create_or_update_pet: createOrUpdatePet,
    save_memory: saveMemory,
    list_memories: listMemories,
    log_summary: logSummary,
};
//# sourceMappingURL=tools.js.map