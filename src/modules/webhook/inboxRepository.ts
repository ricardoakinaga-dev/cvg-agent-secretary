import { getClient, query } from '../../shared/db';
import { config } from '../../config';
import { ChatwootWebhookPayload } from '../../shared/types';

export type InboundReceiptStatus =
  | 'accepted'
  | 'queued'
  | 'processing'
  | 'retry'
  | 'processed'
  | 'dead_letter';

export interface InboundReceipt {
  id: string;
  tenantId: string;
  deliveryId: string;
  eventType: ChatwootWebhookPayload['event'];
  chatwootConversationId: number | null;
  chatwootMessageId: number | null;
  sourceCreatedAt: Date | null;
  correlationId: string;
  payload: ChatwootWebhookPayload;
  status: InboundReceiptStatus;
  attempts: number;
  availableAt: Date;
  processingOwner: string | null;
  processingUntil: Date | null;
  lastActor: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
}

export interface AcceptInboundReceiptInput {
  deliveryId: string;
  payload: ChatwootWebhookPayload;
  correlationId: string;
}

type InboundReceiptRow = Record<string, unknown>;

const DEFAULT_PROCESSING_LEASE_MS = 60_000;

function getMessageId(payload: ChatwootWebhookPayload): number | null {
  if (payload.event !== 'message_created' && payload.event !== 'message_updated') {
    return null;
  }
  const candidate = payload.message?.id ?? payload.id;
  return typeof candidate === 'number' && Number.isSafeInteger(candidate) ? candidate : null;
}

function getSourceCreatedAt(payload: ChatwootWebhookPayload): Date | null {
  const value = payload.message?.created_at ?? payload.created_at;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value < 10_000_000_000 ? value * 1_000 : value;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function minimizePayload(payload: ChatwootWebhookPayload): ChatwootWebhookPayload {
  const message = payload.message
    ? {
        id: payload.message.id,
        content: payload.message.content,
        content_attributes: payload.message.content_attributes?.cvg_idempotency_key
          ? { cvg_idempotency_key: payload.message.content_attributes.cvg_idempotency_key }
          : undefined,
        message_type: payload.message.message_type,
        private: payload.message.private,
        attachments: payload.message.attachments?.map(({ id, filename, content_type }) => ({
          id,
          filename,
          content_type,
        })),
        created_at: payload.message.created_at,
        sender: {
          id: payload.message.sender.id,
          name: payload.message.sender.name,
          type: payload.message.sender.type,
        },
      }
    : undefined;
  const contact = payload.conversation.contact
    ? { id: payload.conversation.contact.id, name: payload.conversation.contact.name }
    : undefined;
  const sender = payload.conversation.meta?.sender
    ? { id: payload.conversation.meta.sender.id, name: payload.conversation.meta.sender.name }
    : undefined;

  return {
    event: payload.event,
    id: payload.id,
    created_at: payload.created_at,
    message,
    content: payload.content,
    content_attributes: payload.content_attributes?.cvg_idempotency_key
      ? { cvg_idempotency_key: payload.content_attributes.cvg_idempotency_key }
      : undefined,
    message_type: payload.message_type,
    private: payload.private,
    sender: payload.sender
      ? { id: payload.sender.id, name: payload.sender.name, type: payload.sender.type }
      : undefined,
    account: payload.account ? { id: payload.account.id } : undefined,
    conversation: {
      id: payload.conversation.id,
      uuid: payload.conversation.uuid,
      account_id: payload.conversation.account_id,
      inbox_id: payload.conversation.inbox_id,
      status: payload.conversation.status,
      assignee_id: payload.conversation.assignee_id,
      contact,
      meta: sender ? { sender } : undefined,
    },
  };
}

function mapRow(row: InboundReceiptRow): InboundReceipt {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    deliveryId: String(row.delivery_id),
    eventType: row.event_type as InboundReceipt['eventType'],
    chatwootConversationId: row.chatwoot_conversation_id === null
      ? null
      : Number(row.chatwoot_conversation_id),
    chatwootMessageId: row.chatwoot_message_id === null
      ? null
      : Number(row.chatwoot_message_id),
    sourceCreatedAt: row.source_created_at === null || row.source_created_at === undefined
      ? null
      : new Date(String(row.source_created_at)),
    correlationId: String(row.correlation_id),
    payload: row.payload as ChatwootWebhookPayload,
    status: row.status as InboundReceiptStatus,
    attempts: Number(row.attempts),
    availableAt: new Date(String(row.available_at)),
    processingOwner: row.processing_owner === null || row.processing_owner === undefined
      ? null
      : String(row.processing_owner),
    processingUntil: row.processing_until === null || row.processing_until === undefined
      ? null
      : new Date(String(row.processing_until)),
    lastActor: row.last_actor === null || row.last_actor === undefined
      ? null
      : String(row.last_actor),
    lastError: row.last_error === null ? null : String(row.last_error),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    processedAt: row.processed_at === null ? null : new Date(String(row.processed_at)),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505');
}

export class InboundReceiptRepository {
  async accept(input: AcceptInboundReceiptInput): Promise<{ receipt: InboundReceipt; duplicate: boolean }> {
    const messageId = getMessageId(input.payload);
    const sourceCreatedAt = getSourceCreatedAt(input.payload);
    const payload = minimizePayload(input.payload);
    const client = await getClient();

    try {
      await client.query('BEGIN');
      const existing = await client.query<InboundReceiptRow>(`
        SELECT *
        FROM inbound_receipts
        WHERE tenant_id = $1
          AND (delivery_id = $2 OR ($3::BIGINT IS NOT NULL AND chatwoot_message_id = $3))
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE
      `, [config.chatwoot.accountId, input.deliveryId, messageId]);

      if (existing.rows[0]) {
        await client.query('COMMIT');
        return { receipt: mapRow(existing.rows[0]), duplicate: true };
      }

      try {
        const inserted = await client.query<InboundReceiptRow>(`
          INSERT INTO inbound_receipts (
            tenant_id, delivery_id, event_type, chatwoot_conversation_id,
            chatwoot_message_id, correlation_id, payload, source_created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB, $8)
          RETURNING *
        `, [
          config.chatwoot.accountId,
          input.deliveryId,
          input.payload.event,
          input.payload.conversation.id,
          messageId,
          input.correlationId,
          JSON.stringify(payload),
          sourceCreatedAt,
        ]);
        await client.query('COMMIT');
        return { receipt: mapRow(inserted.rows[0]), duplicate: false };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        await client.query('ROLLBACK');
        const concurrent = await query<InboundReceiptRow>(`
          SELECT *
          FROM inbound_receipts
          WHERE tenant_id = $1
            AND (delivery_id = $2 OR ($3::BIGINT IS NOT NULL AND chatwoot_message_id = $3))
          ORDER BY created_at ASC
          LIMIT 1
        `, [config.chatwoot.accountId, input.deliveryId, messageId]);
        if (!concurrent.rows[0]) throw error;
        return { receipt: mapRow(concurrent.rows[0]), duplicate: true };
      }
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async markQueued(id: string, actor = 'dispatcher'): Promise<void> {
    await query(`
      UPDATE inbound_receipts
      SET status = 'queued', last_actor = $3
      WHERE tenant_id = $1 AND id = $2 AND status IN ('accepted', 'retry')
    `, [config.chatwoot.accountId, id, actor]);
  }

  async markProcessing(
    id: string,
    owner = 'legacy-worker',
    leaseMs = DEFAULT_PROCESSING_LEASE_MS
  ): Promise<boolean> {
    const result = await query(`
      UPDATE inbound_receipts
      SET status = 'processing', attempts = attempts + 1, last_error = NULL,
          processing_owner = $3,
          processing_until = NOW() + ($4::BIGINT * INTERVAL '1 millisecond'),
          last_actor = $3
      WHERE tenant_id = $1 AND id = $2
        AND (
          status IN ('accepted', 'queued', 'retry')
          OR (status = 'processing' AND (processing_until IS NULL OR processing_until < NOW()))
        )
      RETURNING id
    `, [config.chatwoot.accountId, id, owner, leaseMs]);
    return (result.rowCount || 0) > 0;
  }

  async renewProcessing(id: string, owner: string, leaseMs = DEFAULT_PROCESSING_LEASE_MS): Promise<boolean> {
    const result = await query(`
      UPDATE inbound_receipts
      SET processing_until = NOW() + ($4::BIGINT * INTERVAL '1 millisecond')
      WHERE tenant_id = $1 AND id = $2 AND status = 'processing' AND processing_owner = $3
      RETURNING id
    `, [config.chatwoot.accountId, id, owner, leaseMs]);
    return (result.rowCount || 0) > 0;
  }

  async markRetry(id: string, error: string, delayMs: number, owner?: string): Promise<void> {
    await query(`
      UPDATE inbound_receipts
      SET status = 'retry', last_error = $3,
          available_at = NOW() + ($4::BIGINT * INTERVAL '1 millisecond'),
          processing_owner = NULL, processing_until = NULL,
          last_actor = COALESCE($5, 'worker')
      WHERE tenant_id = $1 AND id = $2
        AND ($5::VARCHAR IS NULL OR processing_owner = $5)
    `, [config.chatwoot.accountId, id, error.slice(0, 2_000), delayMs, owner || null]);
  }

  async markProcessed(id: string, owner?: string): Promise<void> {
    await query(`
      UPDATE inbound_receipts
      SET status = 'processed', processed_at = COALESCE(processed_at, NOW()), last_error = NULL,
          processing_owner = NULL, processing_until = NULL,
          last_actor = COALESCE($3, 'worker')
      WHERE tenant_id = $1 AND id = $2
        AND ($3::VARCHAR IS NULL OR processing_owner = $3)
    `, [config.chatwoot.accountId, id, owner || null]);
  }

  async markDeadLetter(id: string, error: string, owner?: string): Promise<void> {
    await query(`
      UPDATE inbound_receipts
      SET status = 'dead_letter', last_error = $3,
          processing_owner = NULL, processing_until = NULL,
          last_actor = COALESCE($4, 'worker')
      WHERE tenant_id = $1 AND id = $2
        AND ($4::VARCHAR IS NULL OR processing_owner = $4)
    `, [config.chatwoot.accountId, id, error.slice(0, 2_000), owner || null]);
  }

  async getById(id: string): Promise<InboundReceipt | null> {
    const result = await query<InboundReceiptRow>(`
      SELECT *
      FROM inbound_receipts
      WHERE tenant_id = $1 AND id = $2
    `, [config.chatwoot.accountId, id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async hasEarlierUnfinished(id: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(`
      WITH current_receipt AS (
        SELECT tenant_id, chatwoot_conversation_id, source_created_at, created_at, id
        FROM inbound_receipts
        WHERE tenant_id = $1 AND id = $2
      )
      SELECT EXISTS (
        SELECT 1
        FROM inbound_receipts earlier
        CROSS JOIN current_receipt current_row
        WHERE earlier.tenant_id = current_row.tenant_id
          AND earlier.chatwoot_conversation_id = current_row.chatwoot_conversation_id
          AND earlier.id <> current_row.id
          AND earlier.status IN ('accepted', 'queued', 'processing', 'retry')
          AND earlier.source_created_at IS NOT NULL
          AND current_row.source_created_at IS NOT NULL
          AND (
            earlier.source_created_at < current_row.source_created_at
            OR (
              earlier.source_created_at = current_row.source_created_at
              AND earlier.created_at < current_row.created_at
            )
            OR (
              earlier.source_created_at = current_row.source_created_at
              AND earlier.created_at = current_row.created_at
              AND earlier.id < current_row.id
            )
          )
      ) AS exists
    `, [config.chatwoot.accountId, id]);
    return result.rows[0]?.exists === true;
  }

  async findDeadLetters(limit = 100): Promise<InboundReceipt[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const result = await query<InboundReceiptRow>(`
      SELECT *
      FROM inbound_receipts
      WHERE tenant_id = $1 AND status = 'dead_letter'
      ORDER BY updated_at ASC, created_at ASC
      LIMIT $2
    `, [config.chatwoot.accountId, safeLimit]);
    return result.rows.map(mapRow);
  }

  async requeueDeadLetter(id: string, actor = 'manual-replay'): Promise<InboundReceipt | null> {
    const result = await query<InboundReceiptRow>(`
      UPDATE inbound_receipts
      SET status = 'retry', available_at = NOW(), last_error = NULL, last_actor = $3
      WHERE tenant_id = $1 AND id = $2 AND status = 'dead_letter'
      RETURNING *
    `, [config.chatwoot.accountId, id, actor]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async annotateDeadLetter(id: string, reason: string, actor = 'operator'): Promise<boolean> {
    const result = await query(`
      UPDATE inbound_receipts
      SET last_error = $3, last_actor = $4
      WHERE tenant_id = $1 AND id = $2 AND status = 'dead_letter'
    `, [config.chatwoot.accountId, id, reason.slice(0, 2_000), actor]);
    return (result.rowCount || 0) > 0;
  }

  async findRecoverable(limit = 100): Promise<InboundReceipt[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1_000);
    await query(`
      UPDATE inbound_receipts
      SET status = 'retry', available_at = NOW(),
          last_error = COALESCE(last_error, 'Inbound processing lease expired; recovered for retry'),
          processing_owner = NULL, processing_until = NULL,
          last_actor = 'recovery'
      WHERE tenant_id = $1
        AND status = 'processing'
        AND (processing_until IS NULL OR processing_until < NOW())
    `, [config.chatwoot.accountId]);
    const result = await query<InboundReceiptRow>(`
      SELECT *
      FROM inbound_receipts
        WHERE tenant_id = $1
        AND status IN ('accepted', 'queued', 'retry')
        AND available_at <= NOW()
      ORDER BY created_at ASC
      LIMIT $2
    `, [config.chatwoot.accountId, safeLimit]);
    return result.rows.map(mapRow);
  }
}

export const inboundReceiptRepository = new InboundReceiptRepository();

export { getMessageId, minimizePayload };
