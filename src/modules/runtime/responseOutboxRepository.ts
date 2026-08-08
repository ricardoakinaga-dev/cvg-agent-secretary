import { randomUUID } from 'node:crypto';
import { query } from '../../shared/db';
import { config } from '../../config';

export type ResponseOutboxStatus = 'pending' | 'sending' | 'sent' | 'unknown' | 'failed' | 'reconciled';

export interface ResponseIntent {
  id: string;
  tenantId: string;
  conversationId: string;
  chatwootConversationId: number;
  inboundChatwootMessageId: number;
  correlationId: string | null;
  idempotencyKey: string;
  content: string;
  status: ResponseOutboxStatus;
  lockOwner: string | null;
  lockUntil: Date | null;
  lastActor: string | null;
  attempts: number;
  chatwootMessageId: number | null;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export interface CreateResponseIntentInput {
  conversationId: string;
  chatwootConversationId: number;
  inboundChatwootMessageId: number;
  content: string;
  correlationId?: string;
  actor?: string;
}

type ResponseIntentRow = Record<string, unknown>;

function mapRow(row: ResponseIntentRow): ResponseIntent {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    conversationId: String(row.conversation_id),
    chatwootConversationId: Number(row.chatwoot_conversation_id),
    inboundChatwootMessageId: Number(row.inbound_chatwoot_message_id),
    correlationId: row.correlation_id === null || row.correlation_id === undefined
      ? null
      : String(row.correlation_id),
    idempotencyKey: String(row.idempotency_key),
    content: String(row.content),
    status: row.status as ResponseOutboxStatus,
    lockOwner: row.lock_owner === null ? null : String(row.lock_owner),
    lockUntil: row.lock_until === null ? null : new Date(String(row.lock_until)),
    lastActor: row.last_actor === null || row.last_actor === undefined
      ? null
      : String(row.last_actor),
    attempts: Number(row.attempts),
    chatwootMessageId: row.chatwoot_message_id === null ? null : Number(row.chatwoot_message_id),
    lastError: row.last_error === null ? null : String(row.last_error),
    createdAt: new Date(String(row.created_at)),
    sentAt: row.sent_at === null ? null : new Date(String(row.sent_at)),
  };
}

export class ResponseOutboxRepository {
  async createOrGet(input: CreateResponseIntentInput): Promise<ResponseIntent> {
    const idempotencyKey = `cvg:${config.chatwoot.accountId}:${input.chatwootConversationId}:${input.inboundChatwootMessageId}`;
    const result = await query<ResponseIntentRow>(`
      INSERT INTO response_outbox (
        tenant_id, conversation_id, chatwoot_conversation_id,
        inbound_chatwoot_message_id, correlation_id, idempotency_key, content, last_actor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id, conversation_id, inbound_chatwoot_message_id)
      DO UPDATE SET
        correlation_id = COALESCE(response_outbox.correlation_id, EXCLUDED.correlation_id),
        last_actor = COALESCE(response_outbox.last_actor, EXCLUDED.last_actor),
        updated_at = response_outbox.updated_at
      RETURNING *
    `, [
      config.chatwoot.accountId,
      input.conversationId,
      input.chatwootConversationId,
      input.inboundChatwootMessageId,
      input.correlationId || null,
      idempotencyKey,
      input.content,
      input.actor || 'runtime',
    ]);
    return mapRow(result.rows[0]);
  }

  async claimForSend(
    intentId: string,
    owner: string,
    leaseMs: number
  ): Promise<ResponseIntent | null> {
    const result = await query<ResponseIntentRow>(`
      UPDATE response_outbox
      SET status = 'sending',
          lock_owner = $3,
          lock_until = NOW() + ($4::BIGINT * INTERVAL '1 millisecond'),
          last_actor = $3,
          attempts = attempts + 1
      WHERE tenant_id = $1
        AND id = $2
        AND status IN ('pending', 'failed')
      RETURNING *
    `, [config.chatwoot.accountId, intentId, owner, leaseMs]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async markSent(intentId: string, chatwootMessageId: number, owner: string): Promise<ResponseIntent> {
    const result = await query<ResponseIntentRow>(`
      UPDATE response_outbox
      SET status = 'sent', chatwoot_message_id = $3, sent_at = COALESCE(sent_at, NOW()),
          lock_owner = NULL, lock_until = NULL, last_error = NULL, last_actor = $4
      WHERE tenant_id = $1 AND id = $2 AND lock_owner = $4
      RETURNING *
    `, [config.chatwoot.accountId, intentId, chatwootMessageId, owner]);
    if (!result.rows[0]) throw new Error('Response intent ownership was lost before marking sent');
    return mapRow(result.rows[0]);
  }

  async markReconciled(intentId: string, chatwootMessageId: number, owner: string): Promise<ResponseIntent> {
    const result = await query<ResponseIntentRow>(`
      UPDATE response_outbox
      SET status = 'reconciled', chatwoot_message_id = $3, sent_at = COALESCE(sent_at, NOW()),
          lock_owner = NULL, lock_until = NULL, last_error = NULL, last_actor = $4
      WHERE tenant_id = $1 AND id = $2 AND (lock_owner = $4 OR status = 'unknown')
      RETURNING *
    `, [config.chatwoot.accountId, intentId, chatwootMessageId, owner]);
    if (!result.rows[0]) throw new Error('Response intent not found while reconciling');
    return mapRow(result.rows[0]);
  }

  async markUnknown(intentId: string, error: string, owner: string): Promise<void> {
    await query(`
      UPDATE response_outbox
      SET status = 'unknown', last_error = $3, lock_owner = NULL, lock_until = NULL, last_actor = $4
      WHERE tenant_id = $1 AND id = $2 AND lock_owner = $4
    `, [config.chatwoot.accountId, intentId, error.slice(0, 2_000), owner]);
  }

  async markFailed(intentId: string, error: string, owner: string): Promise<void> {
    await query(`
      UPDATE response_outbox
      SET status = 'failed', last_error = $3, lock_owner = NULL, lock_until = NULL, last_actor = $4
      WHERE tenant_id = $1 AND id = $2 AND lock_owner = $4
    `, [config.chatwoot.accountId, intentId, error.slice(0, 2_000), owner]);
  }

  async getById(intentId: string): Promise<ResponseIntent | null> {
    const result = await query<ResponseIntentRow>(`
      SELECT * FROM response_outbox WHERE tenant_id = $1 AND id = $2
    `, [config.chatwoot.accountId, intentId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findByInboundMessageId(inboundChatwootMessageId: number): Promise<ResponseIntent | null> {
    const result = await query<ResponseIntentRow>(`
      SELECT *
      FROM response_outbox
      WHERE tenant_id = $1 AND inbound_chatwoot_message_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [config.chatwoot.accountId, inboundChatwootMessageId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<ResponseIntent | null> {
    const result = await query<ResponseIntentRow>(`
      SELECT *
      FROM response_outbox
      WHERE tenant_id = $1 AND idempotency_key = $2
      LIMIT 1
    `, [config.chatwoot.accountId, idempotencyKey]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findByChatwootMessageId(chatwootMessageId: number): Promise<ResponseIntent | null> {
    const result = await query<ResponseIntentRow>(`
      SELECT *
      FROM response_outbox
      WHERE tenant_id = $1 AND chatwoot_message_id = $2
      ORDER BY sent_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `, [config.chatwoot.accountId, chatwootMessageId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findUnknown(limit = 100): Promise<ResponseIntent[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const result = await query<ResponseIntentRow>(`
      SELECT *
      FROM response_outbox
      WHERE tenant_id = $1 AND status = 'unknown'
      ORDER BY updated_at ASC
      LIMIT $2
    `, [config.chatwoot.accountId, safeLimit]);
    return result.rows.map(mapRow);
  }

  async recoverStaleSending(limit = 100): Promise<number> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const result = await query(`
      WITH stale AS (
        SELECT id
        FROM response_outbox
        WHERE tenant_id = $1
          AND status = 'sending'
          AND lock_until IS NOT NULL
          AND lock_until < NOW()
        ORDER BY updated_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE response_outbox outbox
      SET status = 'unknown', lock_owner = NULL, lock_until = NULL,
          last_error = COALESCE(last_error, 'Response delivery lease expired; reconciliation required'),
          last_actor = 'recovery'
      FROM stale
      WHERE outbox.id = stale.id
      RETURNING outbox.id
    `, [config.chatwoot.accountId, safeLimit]);
    return result.rowCount || result.rows.length;
  }

  async claimUnknown(intentId: string, owner: string, leaseMs: number): Promise<ResponseIntent | null> {
    const result = await query<ResponseIntentRow>(`
      UPDATE response_outbox
      SET status = 'sending', lock_owner = $3,
          lock_until = NOW() + ($4::BIGINT * INTERVAL '1 millisecond'),
          last_actor = $3
      WHERE tenant_id = $1 AND id = $2 AND status = 'unknown'
      RETURNING *
    `, [config.chatwoot.accountId, intentId, owner, leaseMs]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}

export function createDeliveryOwner(): string {
  return randomUUID();
}

export const responseOutboxRepository = new ResponseOutboxRepository();

export { mapRow as mapResponseIntentRow };
