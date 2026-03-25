"use strict";
// Telegram Ingestion Types
// Phase 5: Telegram Ingestion and Knowledge Self-Feeding
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIDENCE_THRESHOLDS = exports.CONTENT_LIMITS = exports.DEFAULT_CHUNKING_CONFIG = void 0;
/**
 * Default chunking configuration
 */
exports.DEFAULT_CHUNKING_CONFIG = {
    chunkSize: 500,
    chunkOverlap: 50,
    strategy: 'markdown-aware',
};
/**
 * Minimum and maximum content lengths
 */
exports.CONTENT_LIMITS = {
    minLength: 50,
    maxLength: 50000,
};
/**
 * Classification confidence thresholds
 */
exports.CONFIDENCE_THRESHOLDS = {
    high: 0.8,
    medium: 0.5,
    low: 0.3,
};
//# sourceMappingURL=types.js.map