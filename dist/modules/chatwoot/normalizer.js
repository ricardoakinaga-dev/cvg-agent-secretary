"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeChatwootMessageType = normalizeChatwootMessageType;
exports.isContactMessage = isContactMessage;
exports.isOutgoingMessage = isOutgoingMessage;
exports.getWebhookMessage = getWebhookMessage;
exports.normalizeMessage = normalizeMessage;
exports.isRelevantEvent = isRelevantEvent;
exports.extractConversationMetadata = extractConversationMetadata;
const crypto_1 = require("crypto");
function normalizeChatwootMessageType(messageType) {
    if (messageType === 'incoming' || messageType === 0) {
        return 'incoming';
    }
    if (messageType === 'outgoing' || messageType === 1) {
        return 'outgoing';
    }
    return null;
}
function isContactMessage(message) {
    return message.sender.type === 'contact';
}
function isOutgoingMessage(message) {
    return normalizeChatwootMessageType(message?.message_type) === 'outgoing';
}
function getWebhookMessage(payload) {
    if (payload.message) {
        return payload.message;
    }
    if (payload.event !== 'message_created' && payload.event !== 'message_updated') {
        return null;
    }
    if (payload.message_type === undefined || payload.message_type === null || typeof payload.id !== 'number') {
        return null;
    }
    return {
        id: payload.id,
        content: payload.content || '',
        message_type: payload.message_type,
        sender: payload.sender || {
            id: getContact(payload).id,
            name: getContact(payload).name,
            type: 'contact',
        },
        attachments: payload.attachments || [],
        private: payload.private || false,
    };
}
function getConversationId(payload) {
    return payload.conversation.uuid || `chatwoot-${payload.conversation.id}`;
}
function getContact(payload) {
    const contact = (payload.conversation.contact || payload.conversation.meta?.sender || payload.sender);
    return {
        id: contact?.id || 0,
        name: contact?.name || 'Cliente',
        email: contact?.email || '',
        phone_number: contact?.phone_number || '',
        identifier: contact?.identifier,
    };
}
/**
 * Normalizes a Chatwoot webhook payload into internal format
 */
function normalizeMessage(payload) {
    const message = getWebhookMessage(payload);
    // Only process incoming public messages. Human takeover is handled separately
    // through outgoing Chatwoot messages, which is the stable signal for agents.
    if (!message ||
        normalizeChatwootMessageType(message.message_type) !== 'incoming') {
        return null;
    }
    // Skip private messages (internal notes)
    if (message.private) {
        return null;
    }
    // Validate required fields
    if (!message.content && (!message.attachments || message.attachments.length === 0)) {
        return null;
    }
    const contact = getContact(payload);
    const normalized = {
        messageId: (0, crypto_1.randomUUID)(),
        chatwootMessageId: message.id,
        conversationId: getConversationId(payload),
        chatwootConversationId: payload.conversation.id,
        contactId: contact.id.toString(),
        chatwootContactId: contact.id,
        content: message.content || '[Mensagem sem texto]',
        messageType: 'incoming',
        senderType: 'user',
        senderName: message.sender.name || contact.name,
        timestamp: new Date(),
        attachments: normalizeAttachments(message),
    };
    return normalized;
}
function normalizeAttachments(message) {
    if (!message.attachments) {
        return [];
    }
    return message.attachments.map((attachment) => ({
        id: attachment.id,
        fileUrl: attachment.external_url || attachment.file_url,
        fileName: attachment.filename,
        contentType: attachment.content_type,
    }));
}
/**
 * Validates if a webhook event should be processed
 */
function isRelevantEvent(payload) {
    const message = getWebhookMessage(payload);
    // Only process message_created events from contacts
    if (payload.event !== 'message_created') {
        return false;
    }
    if (!message) {
        return false;
    }
    // Only process incoming messages. Outgoing messages are handled separately
    // to pause automation when a human takes over.
    if (normalizeChatwootMessageType(message.message_type) !== 'incoming') {
        return false;
    }
    // Only process non-private messages
    if (message.private) {
        return false;
    }
    return true;
}
/**
 * Extracts conversation metadata from webhook payload
 */
function extractConversationMetadata(payload) {
    const contact = getContact(payload);
    return {
        conversationId: getConversationId(payload),
        chatwootConversationId: payload.conversation.id,
        contactId: contact.id.toString(),
        chatwootContactId: contact.id,
        contactName: contact.name,
        inboxId: payload.conversation.inbox_id,
        accountId: payload.conversation.account_id || payload.account?.id || 0,
        status: payload.conversation.status,
    };
}
//# sourceMappingURL=normalizer.js.map