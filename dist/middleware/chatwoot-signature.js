"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeChatwootSignature = computeChatwootSignature;
exports.verifyChatwootSignature = verifyChatwootSignature;
const crypto_1 = require("crypto");
const config_1 = require("../config");
const logging_1 = require("../modules/logging");
function normalizeSignature(signature) {
    return signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
}
function getSignatureHeader(req) {
    return (req.header('x-chatwoot-signature') ||
        req.header('x-hub-signature-256') ||
        req.header('x-signature'));
}
function safeCompareHex(expected, actual) {
    try {
        const expectedBuffer = Buffer.from(expected, 'hex');
        const actualBuffer = Buffer.from(actual, 'hex');
        if (expectedBuffer.length === 0 || expectedBuffer.length !== actualBuffer.length) {
            return false;
        }
        return (0, crypto_1.timingSafeEqual)(expectedBuffer, actualBuffer);
    }
    catch {
        return false;
    }
}
function computeChatwootSignature(rawBody, secret) {
    return (0, crypto_1.createHmac)('sha256', secret).update(rawBody).digest('hex');
}
function verifyChatwootSignature(req, res, next) {
    const secret = config_1.config.chatwoot.webhookSecret;
    if (!secret) {
        next();
        return;
    }
    const signature = getSignatureHeader(req);
    const rawBody = req.rawBody;
    if (!signature || !rawBody) {
        logging_1.logger.warn('Chatwoot webhook signature missing', {
            hasSignature: Boolean(signature),
            hasRawBody: Boolean(rawBody),
        });
        res.status(401).json({ success: false, error: 'Invalid webhook signature' });
        return;
    }
    const expected = computeChatwootSignature(rawBody, secret);
    const actual = normalizeSignature(signature);
    if (!safeCompareHex(expected, actual)) {
        logging_1.logger.warn('Chatwoot webhook signature invalid');
        res.status(401).json({ success: false, error: 'Invalid webhook signature' });
        return;
    }
    next();
}
//# sourceMappingURL=chatwoot-signature.js.map