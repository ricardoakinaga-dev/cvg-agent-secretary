"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeFromChatwoot = normalizeFromChatwoot;
exports.normalizeFromTelegram = normalizeFromTelegram;
exports.normalizeFromWhatsapp = normalizeFromWhatsapp;
exports.detectChannelType = detectChannelType;
exports.isValidChannelMessage = isValidChannelMessage;
const crypto_1 = require("crypto");
const normalizer_1 = require("../chatwoot/normalizer");
function normalizeFromChatwoot(payload) {
    const message = (0, normalizer_1.getWebhookMessage)(payload);
    if (!message || message.message_type !== 'incoming') {
        return null;
    }
    if (!message.content && (!message.attachments || message.attachments.length === 0)) {
        return null;
    }
    const metadata = (0, normalizer_1.extractConversationMetadata)(payload);
    return {
        messageId: (0, crypto_1.randomUUID)(),
        channel: 'chatwoot',
        conversationId: metadata.conversationId,
        contactId: metadata.contactId,
        chatwootConversationId: payload.conversation.id,
        chatwootContactId: metadata.chatwootContactId,
        content: message.content || '[Mensagem sem texto]',
        messageType: 'incoming',
        senderType: 'user',
        senderName: message.sender.name || metadata.contactName,
        senderIdentifier: `chatwoot:${metadata.chatwootContactId}`,
        timestamp: new Date(),
        metadata: {
            inboxId: payload.conversation.inbox_id,
            accountId: metadata.accountId,
            private: message.private,
        },
        attachments: (message.attachments || []).map(a => ({
            id: String(a.id),
            fileUrl: a.external_url || a.file_url,
            fileName: a.filename,
            contentType: a.content_type,
        })),
    };
}
function normalizeFromTelegram(update) {
    if (!update.message || !update.message.text) {
        return null;
    }
    const msg = update.message;
    return {
        messageId: String(update.update_id),
        channel: 'telegram',
        conversationId: `telegram:${msg.chat.id}`,
        contactId: String(msg.from?.id || msg.chat.id),
        content: msg.text || '',
        messageType: 'incoming',
        senderType: 'user',
        senderName: msg.from?.first_name || msg.chat.first_name,
        senderIdentifier: `telegram:${msg.from?.id || msg.chat.id}`,
        timestamp: new Date(msg.date * 1000),
        metadata: {
            telegramChatId: msg.chat.id,
            telegramMessageId: msg.message_id,
            telegramUsername: msg.from?.username,
            telegramLanguageCode: msg.from?.language_code,
        },
        attachments: [],
    };
}
function normalizeFromWhatsapp(payload) {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message || !message.text?.body) {
        return null;
    }
    return {
        messageId: message.id || (0, crypto_1.randomUUID)(),
        channel: 'whatsapp',
        conversationId: `whatsapp:${change.value.metadata.phone_number_id}:${message.from}`,
        contactId: message.from,
        content: message.text.body,
        messageType: 'incoming',
        senderType: 'user',
        senderName: change.value.contacts?.[0]?.profile?.name,
        senderIdentifier: `whatsapp:${message.from}`,
        timestamp: new Date(parseInt(String(message.timestamp), 10) * 1000),
        metadata: {
            whatsappPhoneNumberId: change.value.metadata.phone_number_id,
            waMessageId: message.id,
        },
        attachments: [],
    };
}
function detectChannelType(source) {
    const lower = source.toLowerCase();
    if (lower.includes('chatwoot'))
        return 'chatwoot';
    if (lower.includes('telegram'))
        return 'telegram';
    if (lower.includes('whatsapp') || lower.includes('wa'))
        return 'whatsapp';
    if (lower.includes('email'))
        return 'email';
    return 'unknown';
}
function isValidChannelMessage(msg) {
    return Boolean(msg.messageId &&
        msg.channel !== 'unknown' &&
        msg.content &&
        msg.contactId);
}
//# sourceMappingURL=normalizer.js.map