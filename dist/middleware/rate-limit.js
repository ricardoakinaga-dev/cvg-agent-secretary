"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authLimiter = exports.webhookLimiter = exports.apiLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const logging_1 = require("../modules/logging");
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later' },
    keyGenerator: (req) => {
        return req.headers['x-correlation-id'] || req.ip || 'unknown';
    },
    handler: (req, res) => {
        logging_1.logger.warn('Rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            correlationId: req.headers['x-correlation-id']
        });
        res.status(429).json({
            success: false,
            error: 'Too many requests, please try again later'
        });
    },
});
exports.webhookLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Webhook rate limit exceeded' },
    keyGenerator: (req) => {
        return req.headers['x-chatwoot-account-id'] || req.ip || 'unknown';
    },
    handler: (req, res) => {
        logging_1.logger.warn('Webhook rate limit exceeded', {
            ip: req.ip,
            path: req.path
        });
        res.status(429).json({
            success: false,
            error: 'Webhook rate limit exceeded'
        });
    },
});
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many authentication attempts' },
    handler: (req, res) => {
        logging_1.logger.warn('Auth rate limit exceeded', { ip: req.ip });
        res.status(429).json({
            success: false,
            error: 'Too many authentication attempts, please try again later'
        });
    },
});
//# sourceMappingURL=rate-limit.js.map