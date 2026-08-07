import { createHash } from 'crypto';
import { z } from 'zod';
import { PostgresPrivacyGateway } from './adapters';
import {
  PrivacyAuditAdapter,
  PrivacyAuditFailure,
  PrivacyAuditStart,
  PrivacyOperationReceipt,
} from './types';
import { privacyDigest } from './evidence';

const receiptSchema = z.object({
  id: z.string().min(1),
  operationId: z.string().min(1),
  tenantId: z.string().regex(/^[1-9]\d{0,18}$/),
  idempotencyKey: z.string().min(8).max(128),
  kind: z.enum([
    'retention_preview',
    'retention_purge',
    'subject_export',
    'subject_anonymize',
    'subject_erase',
  ]),
  status: z.literal('completed'),
  actorId: z.string().min(1),
  createdAt: z.string().datetime(),
  scopeHash: z.string().regex(/^[a-f\d]{64}$/),
  evidenceHash: z.string().regex(/^[a-f\d]{64}$/),
  summary: z.record(z.union([z.string(), z.number()])),
});

function operationKey(tenantId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${tenantId}:${idempotencyKey}`).digest('hex');
}

function detailsObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
    } catch {
      return undefined;
    }
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function parseReceipt(row: Record<string, unknown> | undefined): PrivacyOperationReceipt | undefined {
  const details = detailsObject(row?.details);
  const parsed = receiptSchema.safeParse(details?.receipt);
  if (!parsed.success) {
    return undefined;
  }
  const { evidenceHash, ...receiptBase } = parsed.data;
  return privacyDigest(receiptBase) === evidenceHash ? parsed.data : undefined;
}

export class PrivacyOperationInProgressError extends Error {
  constructor() {
    super('Privacy operation is already in progress');
    this.name = 'PrivacyOperationInProgressError';
  }
}

export class PostgresPrivacyAuditAdapter implements PrivacyAuditAdapter {
  constructor(private readonly gateway: PostgresPrivacyGateway) {}

  async findCompleted(
    tenantId: string,
    idempotencyKey: string
  ): Promise<PrivacyOperationReceipt | undefined> {
    return this.gateway.withClient(async (client) => {
      const result = await client.query(`
        SELECT details
        FROM audit_events
        WHERE tenant_id = $1
          AND resource_type = 'privacy_operation'
          AND action = 'completed'
          AND details->'receipt'->>'idempotencyKey' = $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [tenantId, idempotencyKey]);
      return parseReceipt(result.rows[0]);
    });
  }

  async findById(
    tenantId: string,
    receiptId: string
  ): Promise<PrivacyOperationReceipt | undefined> {
    return this.gateway.withClient(async (client) => {
      const result = await client.query(`
        SELECT details
        FROM audit_events
        WHERE tenant_id = $1
          AND resource_type = 'privacy_operation'
          AND action = 'completed'
          AND details->'receipt'->>'id' = $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [tenantId, receiptId]);
      return parseReceipt(result.rows[0]);
    });
  }

  async begin(event: PrivacyAuditStart): Promise<{ operationId: string }> {
    const key = operationKey(event.tenantId, event.idempotencyKey);
    return this.gateway.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      const existing = await client.query(`
        SELECT id
        FROM audit_events
        WHERE tenant_id = $1
          AND resource_type = 'privacy_operation'
          AND resource_id = $2
          AND action IN ('started', 'completed')
        LIMIT 1
      `, [event.tenantId, key]);
      if (existing.rows.length > 0) {
        throw new PrivacyOperationInProgressError();
      }

      const inserted = await client.query(`
        INSERT INTO audit_events (
          tenant_id, event_type, actor, resource_type, resource_id, action, details
        ) VALUES ($1, 'user_action', $2, 'privacy_operation', $3, 'started', $4::JSONB)
        RETURNING id
      `, [
        event.tenantId,
        event.actorId,
        key,
        JSON.stringify({
          idempotencyKey: event.idempotencyKey,
          kind: event.kind,
          scopeHash: event.scopeHash,
          startedAt: event.startedAt,
        }),
      ]);
      const operationId = inserted.rows[0]?.id;
      if (typeof operationId !== 'string' || !operationId) {
        throw new Error('Audit start event did not return an operation id');
      }
      return { operationId };
    });
  }

  async complete(receipt: PrivacyOperationReceipt): Promise<PrivacyOperationReceipt> {
    await this.gateway.withClient(async (client) => {
      await client.query(`
        INSERT INTO audit_events (
          tenant_id, event_type, actor, resource_type, resource_id, action, details
        ) VALUES ($1, 'user_action', $2, 'privacy_operation', $3, 'completed', $4::JSONB)
      `, [
        receipt.tenantId,
        receipt.actorId,
        receipt.operationId,
        JSON.stringify({ receipt }),
      ]);
    });
    return receipt;
  }

  async fail(event: PrivacyAuditFailure): Promise<void> {
    await this.gateway.withClient(async (client) => {
      await client.query(`
        INSERT INTO audit_events (
          tenant_id, event_type, actor, resource_type, resource_id, action, details
        ) VALUES ($1, 'system_error', 'privacy-service', 'privacy_operation', $2, 'failed', $3::JSONB)
      `, [
        event.tenantId,
        event.operationId,
        JSON.stringify({
          idempotencyKey: event.idempotencyKey,
          kind: event.kind,
          code: event.code,
          completedStores: event.completedStores,
          failedAt: event.failedAt,
        }),
      ]);
    });
  }
}
