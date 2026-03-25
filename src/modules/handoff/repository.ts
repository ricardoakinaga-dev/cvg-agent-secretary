// Handoff Repository - Phase 4
// Based on specs/08_HANDOFF_SYSTEM.md

import { query } from '../../shared/db/index.js';
import { logger } from '../logging/index.js';

/**
 * Handoff record types
 */
export interface HandoffRecord {
  id: string;
  conversationId: string;
  contactId: string | null;
  triggerType: string;
  triggerReason: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  summary: string | null;
  pendingQuestions: string[];
  whatWasAnswered: string | null;
  whatIsMissing: string | null;
  riskLevel: 'low' | 'medium' | 'high';
  createdAt: Date;
  completedAt: Date | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
}

export interface CreateHandoffInput {
  conversationId: string;
  contactId?: string;
  triggerType: string;
  triggerReason: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  summary?: string;
  pendingQuestions?: string[];
  whatWasAnswered?: string;
  whatIsMissing?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface HandoffRow {
  id: string;
  conversation_id: string;
  contact_id: string | null;
  trigger_type: string;
  trigger_reason: string;
  status: string;
  priority: string;
  summary: string | null;
  pending_questions: string[];
  what_was_answered: string | null;
  what_is_missing: string | null;
  risk_level: string;
  created_at: Date;
  completed_at: Date | null;
  resolved_by: string | null;
  resolution_notes: string | null;
}

/**
 * Map database row to HandoffRecord
 */
function mapRowToHandoff(row: HandoffRow): HandoffRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    contactId: row.contact_id,
    triggerType: row.trigger_type,
    triggerReason: row.trigger_reason,
    status: row.status as HandoffRecord['status'],
    priority: row.priority as HandoffRecord['priority'],
    summary: row.summary,
    pendingQuestions: Array.isArray(row.pending_questions) ? row.pending_questions : [],
    whatWasAnswered: row.what_was_answered,
    whatIsMissing: row.what_is_missing,
    riskLevel: row.risk_level as HandoffRecord['riskLevel'],
    createdAt: row.created_at,
    completedAt: row.completed_at,
    resolvedBy: row.resolved_by,
    resolutionNotes: row.resolution_notes,
  };
}

/**
 * Operational Rules types
 */
export interface OperationalRule {
  id: string;
  ruleType: string;
  name: string;
  description: string | null;
  content: Record<string, unknown>;
  isActive: boolean;
  priority: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface OperationalRuleRow {
  id: string;
  rule_type: string;
  name: string;
  description: string | null;
  content: Record<string, unknown>;
  is_active: boolean;
  priority: number;
  effective_from: Date;
  effective_to: Date | null;
  created_by: string | null;
  created_at: Date;
}

function mapRowToRule(row: OperationalRuleRow): OperationalRule {
  return {
    id: row.id,
    ruleType: row.rule_type,
    name: row.name,
    description: row.description,
    content: row.content,
    isActive: row.is_active,
    priority: row.priority,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * Sector Notification types
 */
export interface SectorNotification {
  id: string;
  sector: string;
  conversationId: string | null;
  contactId: string | null;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'sent' | 'read' | 'failed';
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface CreateNotificationInput {
  sector: string;
  conversationId?: string;
  contactId?: string;
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface NotificationRow {
  id: string;
  sector: string;
  conversation_id: string | null;
  contact_id: string | null;
  message: string;
  priority: string;
  status: string;
  sent_at: Date | null;
  read_at: Date | null;
  created_at: Date;
}

/**
 * Handoff Repository
 */
export class HandoffRepository {
  
  /**
   * Create a new handoff record
   */
  async create(input: CreateHandoffInput): Promise<HandoffRecord> {
    const sql = `
      INSERT INTO handoffs (
        conversation_id, contact_id, trigger_type, trigger_reason,
        priority, summary, pending_questions, what_was_answered, what_is_missing, risk_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const params = [
      input.conversationId,
      input.contactId || null,
      input.triggerType,
      input.triggerReason,
      input.priority || 'medium',
      input.summary || null,
      JSON.stringify(input.pendingQuestions || []),
      input.whatWasAnswered || null,
      input.whatIsMissing || null,
      input.riskLevel || 'low',
    ];

    try {
      const result = await query<HandoffRow>(sql, params);
      logger.info('Handoff created', { handoffId: result.rows[0].id, conversationId: input.conversationId });
      return mapRowToHandoff(result.rows[0]);
    } catch (error) {
      logger.error('Error creating handoff', error as Error, { input });
      throw error;
    }
  }

  /**
   * Find handoff by conversation ID
   */
  async findByConversation(conversationId: string): Promise<HandoffRecord | null> {
    const sql = `
      SELECT * FROM handoffs 
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    try {
      const result = await query<HandoffRow>(sql, [conversationId]);
      if (result.rows.length === 0) {
        return null;
      }
      return mapRowToHandoff(result.rows[0]);
    } catch (error) {
      logger.error('Error finding handoff by conversation', error as Error, { conversationId });
      throw error;
    }
  }

  /**
   * Update handoff status
   */
  async updateStatus(
    id: string,
    status: HandoffRecord['status'],
    resolvedBy?: string,
    resolutionNotes?: string
  ): Promise<HandoffRecord> {
    const sql = `
      UPDATE handoffs 
      SET status = $1, 
          completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
          resolved_by = COALESCE($3, resolved_by),
          resolution_notes = COALESCE($4, resolution_notes)
      WHERE id = $5
      RETURNING *
    `;

    try {
      const result = await query<HandoffRow>(sql, [status, status, resolvedBy || null, resolutionNotes || null, id]);
      if (result.rows.length === 0) {
        throw new Error('Handoff not found');
      }
      logger.info('Handoff status updated', { handoffId: id, status });
      return mapRowToHandoff(result.rows[0]);
    } catch (error) {
      logger.error('Error updating handoff status', error as Error, { id, status });
      throw error;
    }
  }

  /**
   * Get operational rules by type
   */
  async getOperationalRules(ruleType?: string): Promise<OperationalRule[]> {
    let sql = `
      SELECT * FROM operational_rules 
      WHERE is_active = true
    `;
    
    const params: unknown[] = [];
    
    if (ruleType) {
      sql += ` AND rule_type = $1`;
      params.push(ruleType);
    }
    
    sql += ` ORDER BY priority DESC`;

    try {
      const result = await query<OperationalRuleRow>(sql, params);
      return result.rows.map(mapRowToRule);
    } catch (error) {
      logger.error('Error getting operational rules', error as Error, { ruleType });
      throw error;
    }
  }

  /**
   * Create sector notification
   */
  async createNotification(input: CreateNotificationInput): Promise<SectorNotification> {
    const sql = `
      INSERT INTO sector_notifications (
        sector, conversation_id, contact_id, message, priority
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const params = [
      input.sector,
      input.conversationId || null,
      input.contactId || null,
      input.message,
      input.priority || 'medium',
    ];

    try {
      const result = await query<NotificationRow>(sql, params);
      logger.info('Sector notification created', { notificationId: result.rows[0].id, sector: input.sector });
      return {
        id: result.rows[0].id,
        sector: result.rows[0].sector,
        conversationId: result.rows[0].conversation_id,
        contactId: result.rows[0].contact_id,
        message: result.rows[0].message,
        priority: result.rows[0].priority as SectorNotification['priority'],
        status: result.rows[0].status as SectorNotification['status'],
        sentAt: result.rows[0].sent_at,
        readAt: result.rows[0].read_at,
        createdAt: result.rows[0].created_at,
      };
    } catch (error) {
      logger.error('Error creating notification', error as Error, { input });
      throw error;
    }
  }

  /**
   * Update notification status
   */
  async updateNotificationStatus(id: string, status: SectorNotification['status']): Promise<void> {
    const sql = `
      UPDATE sector_notifications 
      SET status = $1,
          sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE sent_at END,
          read_at = CASE WHEN $1 = 'read' THEN NOW() ELSE read_at END
      WHERE id = $2
    `;

    try {
      await query(sql, [status, id]);
      logger.info('Notification status updated', { notificationId: id, status });
    } catch (error) {
      logger.error('Error updating notification status', error as Error, { id, status });
      throw error;
    }
  }
}

// Export singleton instance
export const handoffRepository = new HandoffRepository();
