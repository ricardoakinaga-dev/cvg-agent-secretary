"use strict";
// Handoff Tools for Agent - Phase 4
// Based on specs/08_HANDOFF_SYSTEM.md and specs/09_AGENT_TOOLS.md
Object.defineProperty(exports, "__esModule", { value: true });
exports.handoffTools = void 0;
exports.createHandoff = createHandoff;
exports.notifySector = notifySector;
exports.createFollowupTask = createFollowupTask;
exports.getOperationalRules = getOperationalRules;
const repository_js_1 = require("./repository.js");
const followupRepository_js_1 = require("./followupRepository.js");
const index_js_1 = require("../logging/index.js");
/**
 * Tool: create_handoff
 * Creates a handoff (transfer to human)
 * Based on specs/09_AGENT_TOOLS.md section 9
 */
async function createHandoff(input) {
    try {
        index_js_1.logger.info('Tool create_handoff called', {
            conversationId: input.conversationId,
            triggerType: input.triggerType,
            triggerReason: input.triggerReason,
        });
        // Validate required fields
        if (!input.conversationId || !input.triggerType || !input.triggerReason) {
            throw new Error('conversationId, triggerType, and triggerReason are required');
        }
        // Create handoff record
        const handoffInput = {
            conversationId: input.conversationId,
            contactId: input.contactId,
            triggerType: input.triggerType,
            triggerReason: input.triggerReason,
            priority: input.riskLevel === 'high' ? 'high' : input.riskLevel === 'critical' ? 'critical' : input.riskLevel === 'low' ? 'low' : 'medium',
            summary: input.summary,
            pendingQuestions: input.pendingQuestions,
            whatWasAnswered: input.whatWasAnswered,
            whatIsMissing: input.whatIsMissing,
            riskLevel: input.riskLevel || 'low',
        };
        const handoff = await repository_js_1.handoffRepository.create(handoffInput);
        index_js_1.logger.info('Handoff created successfully', {
            handoffId: handoff.id,
            conversationId: input.conversationId,
        });
        return {
            success: true,
            handoffId: handoff.id,
            message: `Handoff created successfully. Reason: ${input.triggerReason}`,
        };
    }
    catch (error) {
        index_js_1.logger.error('Tool create_handoff failed', error, {
            conversationId: input.conversationId,
        });
        throw error;
    }
}
/**
 * Tool: notify_sector
 * Sends notification to a specific sector
 * Based on specs/09_AGENT_TOOLS.md section 10
 */
async function notifySector(input) {
    try {
        index_js_1.logger.info('Tool notify_sector called', {
            sector: input.sector,
            priority: input.priority,
            conversationId: input.conversationId,
        });
        // Validate required fields
        if (!input.sector || !input.message) {
            throw new Error('sector and message are required');
        }
        // Validate sector
        const validSectors = ['recepcao', 'clinico', 'gerencia', 'financeiro'];
        if (!validSectors.includes(input.sector)) {
            throw new Error(`Invalid sector. Must be one of: ${validSectors.join(', ')}`);
        }
        // Create notification
        const notification = await repository_js_1.handoffRepository.createNotification({
            sector: input.sector,
            conversationId: input.conversationId,
            contactId: input.contactId,
            message: input.message,
            priority: input.priority || 'medium',
        });
        index_js_1.logger.info('Sector notification created', {
            notificationId: notification.id,
            sector: input.sector,
        });
        // In a real implementation, this would also send the notification
        // via email, Slack, webhook, etc.
        return {
            success: true,
            notificationId: notification.id,
            sector: input.sector,
        };
    }
    catch (error) {
        index_js_1.logger.error('Tool notify_sector failed', error, {
            sector: input.sector,
        });
        throw error;
    }
}
/**
 * Tool: create_followup_task
 * Creates a follow-up task
 * Based on specs/09_AGENT_TOOLS.md section 11
 */
async function createFollowupTask(input) {
    try {
        index_js_1.logger.info('Tool create_followup_task called', {
            conversationId: input.conversationId,
            taskType: input.taskType,
            title: input.title,
        });
        // Validate required fields
        if (!input.taskType || !input.title) {
            throw new Error('taskType and title are required');
        }
        // Validate task type
        const validTypes = ['reminder', 'callback', 'confirmation', 'info'];
        if (!validTypes.includes(input.taskType)) {
            throw new Error(`Invalid taskType. Must be one of: ${validTypes.join(', ')}`);
        }
        // Create followup task
        const taskInput = {
            conversationId: input.conversationId,
            contactId: input.contactId,
            taskType: input.taskType,
            title: input.title,
            description: input.description,
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
            priority: input.priority || 'medium',
        };
        const task = await followupRepository_js_1.followupRepository.create(taskInput);
        index_js_1.logger.info('Followup task created', {
            taskId: task.id,
            conversationId: input.conversationId,
        });
        return {
            success: true,
            taskId: task.id,
            title: input.title,
        };
    }
    catch (error) {
        index_js_1.logger.error('Tool create_followup_task failed', error, {
            conversationId: input.conversationId,
        });
        throw error;
    }
}
/**
 * Tool: get_operational_rules
 * Gets operational rules from the database
 * Based on specs/09_AGENT_TOOLS.md section 8
 */
async function getOperationalRules(input) {
    try {
        index_js_1.logger.info('Tool get_operational_rules called', {
            ruleType: input.ruleType,
        });
        const rules = await repository_js_1.handoffRepository.getOperationalRules(input.ruleType);
        return {
            success: true,
            rules: rules.map(rule => ({
                id: rule.id,
                name: rule.name,
                description: rule.description,
                type: rule.ruleType,
                content: rule.content,
            })),
        };
    }
    catch (error) {
        index_js_1.logger.error('Tool get_operational_rules failed', error, {
            ruleType: input.ruleType,
        });
        throw error;
    }
}
// Export all handoff tools
exports.handoffTools = {
    create_handoff: createHandoff,
    notify_sector: notifySector,
    create_followup_task: createFollowupTask,
    get_operational_rules: getOperationalRules,
};
//# sourceMappingURL=tools.js.map