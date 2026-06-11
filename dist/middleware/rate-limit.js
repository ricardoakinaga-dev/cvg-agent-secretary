"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authLimiter = exports.webhookLimiter = exports.apiLimiter = void 0;
const express_rate_limit_1 = __importStar(require("express-rate-limit"));
const logging_1 = require("../modules/logging");
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later' },
    keyGenerator: (req) => {
        return req.ip ? (0, express_rate_limit_1.ipKeyGenerator)(req.ip, 56) : 'unknown';
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
        return req.headers['x-chatwoot-account-id'] || (req.ip ? (0, express_rate_limit_1.ipKeyGenerator)(req.ip, 56) : 'unknown');
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