import { query } from '../../shared/db';
import { config } from '../../config';
import { maskSensitiveData } from '../../shared/data-masking';

export type ToolExecutionClaim =
  | { state: 'claimed'; id: string }
  | { state: 'completed'; id: string; output: unknown }
  | { state: 'pending'; id: string };

export type ToolReconciliationAction = 'confirm' | 'retry';

export interface ToolExecutionReconciliation {
  id: string;
  conversationId: string | null;
  toolName: string;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
}

interface ToolExecutionRow extends Record<string, unknown> {
  id: string;
  status: string;
  tool_output: unknown;
  conversation_id?: string | null;
  tool_name?: string;
  error_message?: string | null;
  created_at?: Date;
}

export class ToolExecutionRepository {
  async claim(input: {
    conversationId: string;
    contactId?: string;
    toolName: string;
    toolInput: unknown;
    idempotencyKey: string;
  }): Promise<ToolExecutionClaim> {
    const inserted = await query<ToolExecutionRow>(`
      INSERT INTO tool_executions (
        tenant_id, conversation_id, contact_id, tool_name, tool_input,
        status, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5::JSONB, 'pending', $6)
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      RETURNING id, status, tool_output
    `, [
      config.chatwoot.accountId,
      input.conversationId,
      input.contactId || null,
      input.toolName,
      JSON.stringify(input.toolInput),
      input.idempotencyKey,
    ]);
    if (inserted.rows[0]) return { state: 'claimed', id: String(inserted.rows[0].id) };

    const existing = await query<ToolExecutionRow>(`
      SELECT id, status, tool_output
      FROM tool_executions
      WHERE tenant_id = $1 AND idempotency_key = $2
    `, [config.chatwoot.accountId, input.idempotencyKey]);
    const row = existing.rows[0];
    if (!row) throw new Error('Tool execution claim disappeared');
    if (row.status === 'success') {
      return { state: 'completed', id: String(row.id), output: row.tool_output };
    }
    if (row.status === 'reconciled') {
      return { state: 'completed', id: String(row.id), output: row.tool_output };
    }
    if (row.status === 'retryable') {
      const reopened = await query<{ id: string }>(`
        UPDATE tool_executions
        SET status = 'pending', error_message = NULL, reconciled_by = NULL, reconciled_at = NULL
        WHERE tenant_id = $1 AND id = $2 AND status = 'retryable'
        RETURNING id
      `, [config.chatwoot.accountId, row.id]);
      if (reopened.rows[0]) return { state: 'claimed', id: String(reopened.rows[0].id) };
    }
    return { state: 'pending', id: String(row.id) };
  }

  async complete(id: string, output: unknown, durationMs: number): Promise<void> {
    await query(`
      UPDATE tool_executions
      SET status = 'success', tool_output = $3::JSONB, duration_ms = $4,
          error_message = NULL
      WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
    `, [config.chatwoot.accountId, id, JSON.stringify(output), durationMs]);
  }

  async fail(id: string, error: string, durationMs: number): Promise<void> {
    await query(`
      UPDATE tool_executions
      SET status = 'error', error_message = $3, duration_ms = $4
      WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
    `, [config.chatwoot.accountId, id, maskSensitiveData(error).slice(0, 2_000), durationMs]);
  }

  async listReconciliationCandidates(limit = 50): Promise<ToolExecutionReconciliation[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
    const result = await query<ToolExecutionRow>(`
      SELECT id, conversation_id, tool_name, status, error_message, created_at
      FROM tool_executions
      WHERE tenant_id = $1 AND status IN ('pending', 'error', 'retryable')
      ORDER BY created_at ASC, id ASC
      LIMIT $2
    `, [config.chatwoot.accountId, safeLimit]);
    return result.rows.map((row) => ({
      id: String(row.id),
      conversationId: row.conversation_id == null ? null : String(row.conversation_id),
      toolName: String(row.tool_name || 'unknown'),
      status: String(row.status),
      errorMessage: row.error_message == null ? null : String(row.error_message).slice(0, 500),
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    }));
  }

  async reconcile(
    id: string,
    action: ToolReconciliationAction,
    actorId: string,
    reason: string
  ): Promise<ToolExecutionReconciliation> {
    const nextStatus = action === 'confirm' ? 'reconciled' : 'retryable';
    const result = await query<ToolExecutionRow>(`
      UPDATE tool_executions
      SET status = $3,
          tool_output = CASE WHEN $3 = 'reconciled' THEN '{"success":true,"reconciled":true}'::JSONB ELSE tool_output END,
          error_message = $4,
          reconciled_by = $5,
          reconciled_at = NOW()
      WHERE tenant_id = $1 AND id = $2 AND status IN ('pending', 'error', 'retryable')
      RETURNING id, conversation_id, tool_name, status, error_message, created_at
    `, [
      config.chatwoot.accountId,
      id,
      nextStatus,
      maskSensitiveData(reason).slice(0, 500),
      actorId,
    ]);
    const row = result.rows[0];
    if (!row) throw new Error('Tool execution reconciliation target not found or already resolved');
    return {
      id: String(row.id),
      conversationId: row.conversation_id == null ? null : String(row.conversation_id),
      toolName: String(row.tool_name || 'unknown'),
      status: String(row.status),
      errorMessage: row.error_message == null ? null : String(row.error_message).slice(0, 500),
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    };
  }
}

export const toolExecutionRepository = new ToolExecutionRepository();
