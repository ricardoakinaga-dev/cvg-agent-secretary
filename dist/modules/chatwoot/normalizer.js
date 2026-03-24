"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMessage = normalizeMessage;
exports.isRelevantEvent = isRelevantEvent;
exports.extractConversationMetadata = extractConversationMetadata;
const uuid_1 = require("uuid");
/**
 * Normalizes a Chatwoot webhook payload into internal format
 */
function normalizeMessage(payload) {
    // Only process incoming messages from contacts
    if (!payload.message || payload.message.message_type !== 'incoming') {
        return null;
    }
    const message = payload.message;
    // Validate required fields
    if (!message.content && (!message.attachments || message.attachments.length === 0)) {
        return null;
    }
    const normalized = {
        messageId: (0, uuid_1.v4)(),
        chatwootMessageId: message.id,
        conversationId: payload.conversation.uuid,
        chatwootConversationId: payload.conversation.id,
        contactId: payload.conversation.contact.id.toString(),
        chatwootContactId: payload.conversation.contact.id,
        content: message.content || '[Mensagem sem texto]',
        messageType: 'incoming',
        senderType: 'user',
        senderName: message.sender.name,
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
    // Only process message_created events from contacts
    if (payload.event !== 'message_created') {
        return false;
    }
    if (!payload.message) {
        return false;
    }
    // Only process incoming messages
    if (payload.message.message_type !== 'incoming') {
        return false;
    }
    // Only process non-private messages
    if (payload.message.private) {
        return false;
    }
    return true;
}
/**
 * Extracts conversation metadata from webhook payload
 */
function extractConversationMetadata(payload) {
    return {
        conversationId: payload.conversation.uuid,
        chatwootConversationId: payload.conversation.id,
        contactId: payload.conversation.contact.id.toString(),
        chatwootContactId: payload.conversation.contact.id,
        contactName: payload.conversation.contact.name,
        inboxId: payload.conversation.inbox_id,
        accountId: payload.conversation.account_id,
        status: payload.conversation.status,
    };
}
//# sourceMappingURL=normalizer.js.map