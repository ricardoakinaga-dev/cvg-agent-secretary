"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConversationContext = loadConversationContext;
exports.saveConversationContext = saveConversationContext;
exports.addMessageToContext = addMessageToContext;
exports.formatConversationHistory = formatConversationHistory;
exports.shouldProcessConversation = shouldProcessConversation;
exports.updateConversationState = updateConversationState;
exports.loadContactAndMemories = loadContactAndMemories;
const redis_1 = require("../../shared/redis");
const logging_1 = require("../logging");
const repository_1 = require("../contacts/repository");
const repository_2 = require("../pets/repository");
const repository_3 = require("../memory/repository");
/**
 * Load conversation context from Redis
 */
async function loadConversationContext(conversationId, chatwootConversationId, contactId, chatwootContactId, contactName, inboxId, accountId) {
    logging_1.logger.info('Loading conversation context', { conversationId });
    // Try to get existing state
    const existingState = await redis_1.redisClient.getConversationState(conversationId);
    if (existingState) {
        logging_1.logger.info('Found existing conversation state', { conversationId });
        return {
            conversationId,
            chatwootConversationId,
            contactId,
            chatwootContactId,
            contactName,
            messages: existingState.messages || [],
            metadata: existingState.metadata,
            state: existingState.state || 'in_progress',
        };
    }
    // Create new context
    const newContext = {
        conversationId,
        chatwootConversationId,
        contactId,
        chatwootContactId,
        contactName,
        messages: [],
        metadata: {
            startedAt: new Date(),
            messageCount: 0,
            lastMessageAt: new Date(),
            inboxId,
            accountId,
        },
        state: 'new',
    };
    // Save initial state
    await saveConversationContext(newContext);
    logging_1.logger.info('Created new conversation context', { conversationId });
    return newContext;
}
/**
 * Save conversation context to Redis
 */
async function saveConversationContext(context) {
    await redis_1.redisClient.setConversationState(context.conversationId, {
        messages: context.messages,
        metadata: context.metadata,
        state: context.state,
    });
}
/**
 * Add message to conversation context
 */
async function addMessageToContext(context, message) {
    // Add to messages array
    context.messages.push(message);
    // Update metadata
    context.metadata.messageCount += 1;
    context.metadata.lastMessageAt = new Date();
    // Update state
    if (context.state === 'new') {
        context.state = 'in_progress';
    }
    // Save to Redis
    await saveConversationContext(context);
    // Also append to message list for easier retrieval
    await redis_1.redisClient.appendMessageToConversation(context.conversationId, {
        ...message,
        timestamp: message.timestamp.toISOString(),
    });
    return context;
}
/**
 * Get conversation messages formatted for OpenAI
 */
function formatConversationHistory(messages) {
    return messages.map((msg) => {
        const sender = msg.senderType === 'user' ? msg.senderName : 'Atendente';
        return `${sender}: ${msg.content}`;
    });
}
/**
 * Check if conversation is in a state that should be processed
 */
function shouldProcessConversation(context) {
    // Don't process if already handed off or completed
    if (context.state === 'handoff' || context.state === 'completed' || context.state === 'failed') {
        return false;
    }
    return true;
}
/**
 * Update conversation state
 */
async function updateConversationState(context, newState) {
    logging_1.logger.info('Updating conversation state', {
        conversationId: context.conversationId,
        from: context.state,
        to: newState,
    });
    context.state = newState;
    await saveConversationContext(context);
}
/**
 * Load contact and memory for context (Phase 2)
 */
async function loadContactAndMemories(chatwootContactId, contactName) {
    try {
        // Try to find existing contact by chatwoot_id
        let contact = await repository_1.contactRepository.find({ chatwootId: chatwootContactId });
        // If not found, try by name (less reliable)
        if (!contact) {
            contact = await repository_1.contactRepository.find({ name: contactName });
        }
        // If still not found, create a new contact
        if (!contact) {
            contact = await repository_1.contactRepository.create({
                chatwootId: chatwootContactId,
                name: contactName,
                preferredChannel: 'chatwoot',
            });
            logging_1.logger.info('Created new contact from conversation', {
                contactId: contact.id,
                chatwootContactId
            });
        }
        // Load memories for this contact
        const memories = await repository_3.memoryRepository.getContextForLLM(contact.id);
        // Load pets for this contact
        const pets = await repository_2.petRepository.find({ contactId: contact.id });
        return {
            contactId: contact.id,
            contact: {
                id: contact.id,
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
            },
            memories,
            pets,
        };
    }
    catch (error) {
        logging_1.logger.error('Error loading contact and memories', error, {
            chatwootContactId
        });
        return {
            contactId: null,
            contact: null,
            memories: [],
            pets: [],
        };
    }
}
//# sourceMappingURL=contextLoader.js.map