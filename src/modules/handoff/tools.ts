// Handoff Tools for Agent - Phase 4
// Based on specs/08_HANDOFF_SYSTEM.md and specs/09_AGENT_TOOLS.md

import { handoffRepository, CreateHandoffInput } from './repository.js';
import { followupRepository, CreateFollowupInput } from './followupRepository.js';
import { logger } from '../logging/index.js';

/**
 * Input for create_handoff tool
 */
export interface CreateHandoffToolInput {
  conversationId: string;
  contactId?: string;
  triggerType: string;
  triggerReason: string;
  summary?: string;
  pendingQuestions?: string[];
  whatWasAnswered?: string;
  whatIsMissing?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Output from create_handoff tool
 */
export interface CreateHandoffToolOutput {
  success: boolean;
  handoffId: string;
  message: string;
}

/**
 * Tool: create_handoff
 * Creates a handoff (transfer to human)
 * Based on specs/09_AGENT_TOOLS.md section 9
 */
export async function createHandoff(input: CreateHandoffToolInput): Promise<CreateHandoffToolOutput> {
  try {
    logger.info('Tool create_handoff called', {
      conversationId: input.conversationId,
      triggerType: input.triggerType,
      triggerReason: input.triggerReason,
    });

    // Validate required fields
    if (!input.conversationId || !input.triggerType || !input.triggerReason) {
      throw new Error('conversationId, triggerType, and triggerReason are required');
    }

    // Create handoff record
    const handoffInput: CreateHandoffInput = {
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

    const handoff = await handoffRepository.create(handoffInput);

    logger.info('Handoff created successfully', {
      handoffId: handoff.id,
      conversationId: input.conversationId,
    });

    return {
      success: true,
      handoffId: handoff.id,
      message: `Handoff created successfully. Reason: ${input.triggerReason}`,
    };
  } catch (error) {
    logger.error('Tool create_handoff failed', error as Error, {
      conversationId: input.conversationId,
    });
    throw error;
  }
}

/**
 * Input for notify_sector tool
 */
export interface NotifySectorInput {
  sector: 'recepcao' | 'clinico' | 'gerencia' | 'financeiro';
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  conversationId?: string;
  contactId?: string;
}

/**
 * Output from notify_sector tool
 */
export interface NotifySectorOutput {
  success: boolean;
  notificationId: string;
  sector: string;
}

/**
 * Tool: notify_sector
 * Sends notification to a specific sector
 * Based on specs/09_AGENT_TOOLS.md section 10
 */
export async function notifySector(input: NotifySectorInput): Promise<NotifySectorOutput> {
  try {
    logger.info('Tool notify_sector called', {
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
    const notification = await handoffRepository.createNotification({
      sector: input.sector,
      conversationId: input.conversationId,
      contactId: input.contactId,
      message: input.message,
      priority: input.priority || 'medium',
    });

    logger.info('Sector notification created', {
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
  } catch (error) {
    logger.error('Tool notify_sector failed', error as Error, {
      sector: input.sector,
    });
    throw error;
  }
}

/**
 * Input for create_followup_task tool
 */
export interface CreateFollowupTaskInput {
  conversationId?: string;
  contactId?: string;
  taskType: 'reminder' | 'callback' | 'confirmation' | 'info';
  title: string;
  description?: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Output from create_followup_task tool
 */
export interface CreateFollowupTaskOutput {
  success: boolean;
  taskId: string;
  title: string;
}

/**
 * Tool: create_followup_task
 * Creates a follow-up task
 * Based on specs/09_AGENT_TOOLS.md section 11
 */
export async function createFollowupTask(input: CreateFollowupTaskInput): Promise<CreateFollowupTaskOutput> {
  try {
    logger.info('Tool create_followup_task called', {
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
    const taskInput: CreateFollowupInput = {
      conversationId: input.conversationId,
      contactId: input.contactId,
      taskType: input.taskType,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      priority: input.priority || 'medium',
    };

    const task = await followupRepository.create(taskInput);

    logger.info('Followup task created', {
      taskId: task.id,
      conversationId: input.conversationId,
    });

    return {
      success: true,
      taskId: task.id,
      title: input.title,
    };
  } catch (error) {
    logger.error('Tool create_followup_task failed', error as Error, {
      conversationId: input.conversationId,
    });
    throw error;
  }
}

/**
 * Input for get_operational_rules tool
 */
export interface GetOperationalRulesInput {
  ruleType?: 'policy' | 'schedule' | 'handoff' | 'security' | 'pricing';
}

/**
 * Output from get_operational_rules tool
 */
export interface GetOperationalRulesOutput {
  success: boolean;
  rules: Array<{
    id: string;
    name: string;
    description: string | null;
    type: string;
    content: Record<string, unknown>;
  }>;
}

/**
 * Tool: get_operational_rules
 * Gets operational rules from the database
 * Based on specs/09_AGENT_TOOLS.md section 8
 */
export async function getOperationalRules(input: GetOperationalRulesInput): Promise<GetOperationalRulesOutput> {
  try {
    logger.info('Tool get_operational_rules called', {
      ruleType: input.ruleType,
    });

    const rules = await handoffRepository.getOperationalRules(input.ruleType);

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
  } catch (error) {
    logger.error('Tool get_operational_rules failed', error as Error, {
      ruleType: input.ruleType,
    });
    throw error;
  }
}

// Export all handoff tools
export const handoffTools = {
  create_handoff: createHandoff,
  notify_sector: notifySector,
  create_followup_task: createFollowupTask,
  get_operational_rules: getOperationalRules,
};

export type HandoffToolName = keyof typeof handoffTools;
