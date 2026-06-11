"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDedupContent = normalizeDedupContent;
exports.generateMessageDedupHash = generateMessageDedupHash;
exports.generateContentDedupHash = generateContentDedupHash;
const crypto_1 = __importDefault(require("crypto"));
function normalizeDedupContent(content) {
    return content.trim().replace(/\s+/g, ' ').toLowerCase();
}
function generateMessageDedupHash(conversationId, messageId, content) {
    return crypto_1.default
        .createHash('sha256')
        .update(`${conversationId}-${messageId}-${content}`)
        .digest('hex');
}
function generateContentDedupHash(conversationId, contactId, content) {
    return crypto_1.default
        .createHash('sha256')
        .update(`${conversationId}-${contactId}-${normalizeDedupContent(content)}`)
        .digest('hex');
}
//# sourceMappingURL=dedup.js.map