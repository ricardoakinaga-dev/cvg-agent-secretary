// Followup Repository - Phase 4
// Uses existing followup_tasks table from Phase 2

import { query } from '../../shared/db/index.js';
import { logger } from '../logging/index.js';

/**
 * Followup Task types
 */
export interface FollowupTask {
  id: string;
  conversationId: string | null;
  contactId: string | null;
  taskType: 'reminder' | 'callback' | 'confirmation' | 'info';
  title: string;
  description: string | null;
  dueDate: Date | null;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assignedTo: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  createdAt: Date;
}

export interface CreateFollowupInput {
  conversationId?: string;
  contactId?: string;
  taskType: 'reminder' | 'callback' | 'confirmation' | 'info';
  title: string;
  description?: string;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high';
}

interface FollowupRow {
  id: string;
  conversation_id: string | null;
  contact_id: string | null;
  task_type: string;
  title: string;
  description: string | null;
  due_date: Date | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  completed_at: Date | null;
  completed_by: string | null;
  created_at: Date;
}

function mapRowToFollowup(row: FollowupRow): FollowupTask {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    contactId: row.contact_id,
    taskType: row.task_type as FollowupTask['taskType'],
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    priority: row.priority as FollowupTask['priority'],
    status: row.status as FollowupTask['status'],
    assignedTo: row.assigned_to,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    createdAt: row.created_at,
  };
}

/**
 * Followup Repository
 */
export class FollowupRepository {
  
  /**
   * Create a new followup task
   */
  async create(input: CreateFollowupInput): Promise<FollowupTask> {
    const sql = `
      INSERT INTO followup_tasks (
        conversation_id, contact_id, task_type, title, description, due_date, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const params = [
      input.conversationId || null,
      input.contactId || null,
      input.taskType,
      input.title,
      input.description || null,
      input.dueDate || null,
      input.priority || 'medium',
    ];

    try {
      const result = await query<FollowupRow>(sql, params);
      logger.info('Followup task created', { taskId: result.rows[0].id });
      return mapRowToFollowup(result.rows[0]);
    } catch (error) {
      logger.error('Error creating followup task', error as Error, { input });
      throw error;
    }
  }

  /**
   * Find followups by conversation
   */
  async findByConversation(conversationId: string): Promise<FollowupTask[]> {
    const sql = `
      SELECT * FROM followup_tasks 
      WHERE conversation_id = $1
      ORDER BY due_date ASC, created_at DESC
    `;

    try {
      const result = await query<FollowupRow>(sql, [conversationId]);
      return result.rows.map(mapRowToFollowup);
    } catch (error) {
      logger.error('Error finding followups by conversation', error as Error, { conversationId });
      throw error;
    }
  }

  /**
   * Find pending followups
   */
  async findPending(limit: number = 50): Promise<FollowupTask[]> {
    const sql = `
      SELECT * FROM followup_tasks 
      WHERE status = 'pending'
      ORDER BY 
        CASE priority 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          WHEN 'low' THEN 3 
        END,
        due_date ASC
      LIMIT $1
    `;

    try {
      const result = await query<FollowupRow>(sql, [limit]);
      return result.rows.map(mapRowToFollowup);
    } catch (error) {
      logger.error('Error finding pending followups', error as Error);
      throw error;
    }
  }

  /**
   * Update followup status
   */
  async updateStatus(
    id: string,
    status: FollowupTask['status'],
    completedBy?: string
  ): Promise<FollowupTask> {
    const sql = `
      UPDATE followup_tasks 
      SET status = $1,
          completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
          completed_by = CASE WHEN $1 = 'completed' THEN COALESCE($2, completed_by) ELSE completed_by END
      WHERE id = $3
      RETURNING *
    `;

    try {
      const result = await query<FollowupRow>(sql, [status, completedBy || null, id]);
      if (result.rows.length === 0) {
        throw new Error('Followup task not found');
      }
      logger.info('Followup task status updated', { taskId: id, status });
      return mapRowToFollowup(result.rows[0]);
    } catch (error) {
      logger.error('Error updating followup status', error as Error, { id, status });
      throw error;
    }
  }
}

// Export singleton instance
export const followupRepository = new FollowupRepository();
