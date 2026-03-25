"use strict";
// Analytics Event Types
// Phase 4: Operational Analytics
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_OUTCOMES = exports.ANALYTICS_EVENT_TYPES = void 0;
exports.ANALYTICS_EVENT_TYPES = {
    CONVERSATION_STARTED: 'conversation_started',
    MESSAGE_RECEIVED: 'message_received',
    RESPONSE_SENT: 'response_sent',
    HANDOFF_TRIGGERED: 'handoff_triggered',
    FALLBACK_TRIGGERED: 'fallback_triggered',
    ERROR_OCCURRED: 'error_occurred',
    CONVERSATION_ENDED: 'conversation_ended',
};
exports.EVENT_OUTCOMES = {
    AUTO_RESOLVED: 'auto_resolved',
    HANDOFF_TO_HUMAN: 'handoff_to_human',
    ESCALATED: 'escalated',
    FAILED: 'failed',
};
//# sourceMappingURL=types.js.map