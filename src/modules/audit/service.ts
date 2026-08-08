// Durable audit trail and transactional outbox.

import { createHash, randomUUID } from 'node:crypto';
import { query } from '../../shared/db';
import { config } from '../../config';
import { clampInteger } from '../../shared/numbers';
import { isValidRole, Role, UserContext } from '../auth/rbac';
import { logger } from '../logging';

export type AuditEventType =
  | 'handoff_triggered'
  | 'knowledge_published'
  | 'knowledge_rejected'
  | 'knowledge_updated'
  | 'ingestion_approved'
  | 'ingestion_rejected'
  | 'user_action'
  | 'system_error'
  | 'config_change'
  | 'login'
  | 'logout'
  | 'role_change';

export type AuditActorSource = 'signed_identity' | 'trusted_service' | 'legacy';
export type AuditActorRole = Role | 'system';

const AUDIT_PRINCIPAL_BRAND: unique symbol = Symbol('verified-audit-principal');

/**
 * Opaque principal created only from middleware-authenticated server context.
 * Repositories use this instead of accepting an actor string from callers.
 */
export interface AuditPrincipal {
  readonly [AUDIT_PRINCIPAL_BRAND]: true;
  readonly id: string;
  readonly role: Role;
  readonly source: 'signed_identity' | 'trusted_service';
  readonly correlationId?: string;
}

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  actor: string;
  actorRole?: AuditActorRole;
  actorSource: AuditActorSource;
  resourceType: string;
  resourceId: string;
  action: string;
  details: Record<string, unknown>;
  correlationId?: string;
  /** Legacy events may contain an IP; new outbox events deliberately do not. */
  ipAddress?: string;
  integrityHash?: string;
  integrityVerified: boolean;
  createdAt: Date;
}

export interface CreateAuditEventInput {
  eventType: AuditEventType;
  /** Server-authenticated subject or a fixed service principal; never request body data. */
  actor: string;
  actorRole?: AuditActorRole;
  actorSource?: AuditActorSource;
  resourceType: string;
  resourceId: string;
  action: string;
  details?: Record<string, unknown>;
  correlationId?: string;
  /** Stable operation key for retry-safe critical mutations. */
  idempotencyKey?: string;
}

export interface AuditQueryClient {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

interface AuditQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
}

export interface AuditIntegrityInput {
  tenantId: string;
  idempotencyKey: string;
  eventType: AuditEventType;
  actor: string;
  actorRole?: AuditActorRole;
  actorSource: AuditActorSource;
  resourceType: string;
  resourceId: string;
  action: string;
  details: Record<string, unknown>;
  correlationId?: string;
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RESOURCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,254}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_DETAIL_STRING_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SAFE_DETAIL_KEYS = new Set([
  'affectedCount',
  'category',
  'code',
  'completedStores',
  'errorType',
  'errorHash',
  'handoffId',
  'ingestionId',
  'knowledgeDocumentId',
  'outcome',
  'provider',
  'priority',
  'reasonHash',
  'ruleId',
  'status',
  'riskLevel',
  'triggerType',
  'toolName',
  'storeCount',
  'version',
]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

function safeDetailValue(value: unknown): unknown {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && SAFE_DETAIL_STRING_PATTERN.test(value)) return value;
  if (Array.isArray(value) && value.length <= 20) {
    const entries = value.map(safeDetailValue).filter((entry) => entry !== undefined);
    return entries.length === value.length ? entries : undefined;
  }
  return undefined;
}

/** Audit details are allowlisted metadata, never free-form conversation or clinical content. */
export function minimizeAuditDetails(details: Record<string, unknown> = {}): Record<string, unknown> {
  const minimized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_DETAIL_KEYS.has(key)) continue;
    const safeValue = safeDetailValue(value);
    if (safeValue !== undefined) minimized[key] = safeValue;
  }
  return minimized;
}

export function computeAuditIntegrityHash(input: AuditIntegrityInput): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({
      ...input,
      actorRole: input.actorRole ?? null,
      correlationId: input.correlationId ?? null,
    })))
    .digest('hex');
}

function resultOf(value: unknown): AuditQueryResult {
  if (!value || typeof value !== 'object' || !Array.isArray((value as AuditQueryResult).rows)) {
    throw new Error('Invalid audit storage response');
  }
  return value as AuditQueryResult;
}

function assertIdentifier(value: string, label: string, pattern = RESOURCE_PATTERN): void {
  if (!pattern.test(value)) throw new Error(`Invalid audit ${label}`);
}

function normalizeActor(input: CreateAuditEventInput): {
  actor: string;
  actorRole?: AuditActorRole;
  actorSource: AuditActorSource;
} {
  assertIdentifier(input.actor, 'actor', IDENTIFIER_PATTERN);
  const actorSource = input.actorSource ?? (input.actor === 'system' ? 'trusted_service' : 'legacy');
  if (!['signed_identity', 'trusted_service', 'legacy'].includes(actorSource)) {
    throw new Error('Invalid audit actor source');
  }
  if (input.actorRole !== undefined
    && input.actorRole !== 'system'
    && !isValidRole(input.actorRole)) {
    throw new Error('Invalid audit actor role');
  }
  if (actorSource === 'signed_identity' && input.actorRole === 'system') {
    throw new Error('Invalid signed audit actor role');
  }
  return { actor: input.actor, actorRole: input.actorRole, actorSource };
}

export function createAuthenticatedAuditPrincipal(
  user: UserContext | undefined,
  correlationId?: string
): AuditPrincipal {
  if (!user || !isValidRole(user.role)) {
    throw new Error('Authenticated audit principal is required');
  }
  assertIdentifier(user.id, 'actor', IDENTIFIER_PATTERN);
  if (correlationId !== undefined) {
    assertIdentifier(correlationId, 'correlation id', IDENTIFIER_PATTERN);
  }
  return Object.freeze({
    [AUDIT_PRINCIPAL_BRAND]: true as const,
    id: user.id,
    role: user.role,
    source: user.id === 'legacy-api-service' ? 'trusted_service' as const : 'signed_identity' as const,
    correlationId,
  });
}

export function assertAuditPrincipal(value: unknown): asserts value is AuditPrincipal {
  if (!value
    || typeof value !== 'object'
    || (value as Partial<AuditPrincipal>)[AUDIT_PRINCIPAL_BRAND] !== true) {
    throw new Error('Verified audit principal is required');
  }
}

class AuditService {
  async recordEvent(input: CreateAuditEventInput, client?: AuditQueryClient): Promise<void> {
    const actor = normalizeActor(input);
    assertIdentifier(input.resourceType, 'resource type');
    assertIdentifier(input.resourceId, 'resource id');
    assertIdentifier(input.action, 'action');
    if (input.idempotencyKey && (input.idempotencyKey.length > 200 || input.idempotencyKey.length < 8)) {
      throw new Error('Invalid audit idempotency key');
    }
    if (input.correlationId && input.correlationId.length > 128) {
      throw new Error('Invalid audit correlation id');
    }

    const tenantId = config.chatwoot.accountId;
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const details = minimizeAuditDetails(input.details);
    const integrityInput: AuditIntegrityInput = {
      tenantId,
      idempotencyKey,
      eventType: input.eventType,
      ...actor,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      details,
      correlationId: input.correlationId,
    };
    const integrityHash = computeAuditIntegrityHash(integrityInput);
    const eventId = randomUUID();
    const executor = client?.query.bind(client) ?? query;

    try {
      const inserted = resultOf(await executor(`
        INSERT INTO audit_outbox (
          id, tenant_id, event_type, actor, actor_role, actor_source,
          resource_type, resource_id, action, idempotency_key, details,
          correlation_id, integrity_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB, $12, $13)
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
        RETURNING id, integrity_hash
      `, [
        eventId,
        tenantId,
        input.eventType,
        actor.actor,
        actor.actorRole ?? null,
        actor.actorSource,
        input.resourceType,
        input.resourceId,
        input.action,
        idempotencyKey,
        JSON.stringify(details),
        input.correlationId ?? null,
        integrityHash,
      ]));

      let durableEvent = inserted.rows[0];
      if (!durableEvent) {
        const existing = resultOf(await executor(`
          SELECT id, integrity_hash
          FROM audit_outbox
          WHERE tenant_id = $1 AND idempotency_key = $2
        `, [tenantId, idempotencyKey]));
        durableEvent = existing.rows[0];
      }
      if (!durableEvent || durableEvent.integrity_hash !== integrityHash) {
        throw new Error('Audit idempotency conflict');
      }

      const durableEventId = String(durableEvent.id);
      if (client) {
        // This projection participates in the caller transaction. Any failure
        // rejects the critical mutation, while the outbox makes retries safe.
        await this.materializeEvent(durableEventId, tenantId, client);
      } else {
        // The outbox is already committed. Projection failure must not erase
        // evidence; a later reconciliation will materialize it idempotently.
        try {
          await this.materializeEvent(durableEventId, tenantId);
        } catch (projectionError) {
          logger.error('Audit event remains pending in durable outbox', projectionError as Error, {
            eventType: input.eventType,
            resourceType: input.resourceType,
            action: input.action,
          });
        }
      }

      logger.info('Audit event durably recorded', {
        eventType: input.eventType,
        actorSource: actor.actorSource,
        resourceType: input.resourceType,
        action: input.action,
      });
    } catch (error) {
      logger.error('Failed to durably record audit event', error as Error, {
        eventType: input.eventType,
        resourceType: input.resourceType,
        action: input.action,
      });
      throw error;
    }
  }

  async dispatchPendingEvents(limit = 100): Promise<number> {
    const boundedLimit = clampInteger(limit, 100, 1, 500);
    const result = await query(`
      WITH pending AS (
        SELECT outbox.*
        FROM audit_outbox outbox
        WHERE outbox.tenant_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM audit_events event
            WHERE event.tenant_id = outbox.tenant_id
              AND event.outbox_event_id = outbox.id
          )
        ORDER BY outbox.occurred_at, outbox.id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      INSERT INTO audit_events (
        tenant_id, event_type, actor, actor_role, actor_source,
        resource_type, resource_id, action, details, correlation_id,
        idempotency_key, integrity_hash, outbox_event_id, created_at
      )
      SELECT
        tenant_id, event_type, actor, actor_role, actor_source,
        resource_type, resource_id, action, details, correlation_id,
        idempotency_key, integrity_hash, id, occurred_at
      FROM pending
      ON CONFLICT (tenant_id, outbox_event_id) DO NOTHING
      RETURNING outbox_event_id AS id
    `, [config.chatwoot.accountId, boundedLimit]);
    return result.rowCount ?? result.rows.length;
  }

  async getEvents(filters?: {
    eventType?: AuditEventType;
    actor?: string;
    resourceType?: string;
    since?: Date;
    limit?: number;
  }): Promise<AuditEvent[]> {
    await this.dispatchPendingEvents();

    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [config.chatwoot.accountId];
    let paramIndex = 2;

    if (filters?.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(filters.eventType);
    }
    if (filters?.actor) {
      conditions.push(`actor = $${paramIndex++}`);
      params.push(filters.actor);
    }
    if (filters?.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }
    if (filters?.since) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.since);
    }

    const limit = clampInteger(filters?.limit, 100, 1, 500);
    params.push(limit);
    const result = await query(`
      SELECT * FROM audit_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `, params);
    return result.rows.map((row) => this.mapRowToEvent(row));
  }

  private async materializeEvent(
    outboxEventId: string,
    tenantId: string,
    client?: AuditQueryClient
  ): Promise<void> {
    const executor = client?.query.bind(client) ?? query;
    await executor(`
      INSERT INTO audit_events (
        tenant_id, event_type, actor, actor_role, actor_source,
        resource_type, resource_id, action, details, correlation_id,
        idempotency_key, integrity_hash, outbox_event_id, created_at
      )
      SELECT
        tenant_id, event_type, actor, actor_role, actor_source,
        resource_type, resource_id, action, details, correlation_id,
        idempotency_key, integrity_hash, id, occurred_at
      FROM audit_outbox
      WHERE tenant_id = $1 AND id = $2
      ON CONFLICT (tenant_id, outbox_event_id) DO NOTHING
      RETURNING outbox_event_id AS id
    `, [tenantId, outboxEventId]);
  }

  private mapRowToEvent(row: Record<string, unknown>): AuditEvent {
    const details = typeof row.details === 'string'
      ? JSON.parse(row.details) as Record<string, unknown>
      : (row.details as Record<string, unknown>) || {};
    const actorRole = row.actor_role as AuditActorRole | undefined;
    const actorSource = (row.actor_source as AuditActorSource | undefined) ?? 'legacy';
    const integrityHash = row.integrity_hash as string | undefined;
    const idempotencyKey = row.idempotency_key as string | undefined;
    let integrityVerified = false;

    if (integrityHash && idempotencyKey && HASH_PATTERN.test(integrityHash)) {
      const expected = computeAuditIntegrityHash({
        tenantId: String(row.tenant_id),
        idempotencyKey,
        eventType: row.event_type as AuditEventType,
        actor: row.actor as string,
        actorRole,
        actorSource,
        resourceType: row.resource_type as string,
        resourceId: row.resource_id as string,
        action: row.action as string,
        details,
        correlationId: row.correlation_id as string | undefined,
      });
      integrityVerified = expected === integrityHash;
      if (!integrityVerified) {
        throw new Error(`Audit integrity verification failed for event ${String(row.id)}`);
      }
    }

    return {
      id: row.id as string,
      eventType: row.event_type as AuditEventType,
      actor: row.actor as string,
      actorRole,
      actorSource,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string,
      action: row.action as string,
      details,
      correlationId: row.correlation_id as string | undefined,
      ipAddress: row.ip_address as string | undefined,
      integrityHash,
      integrityVerified,
      createdAt: new Date(row.created_at as string),
    };
  }
}

export const auditService = new AuditService();
