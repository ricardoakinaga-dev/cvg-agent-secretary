const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({
  query: mockQuery,
}));

import {
  assertAuditPrincipal,
  auditService,
  computeAuditIntegrityHash,
  createAuthenticatedAuditPrincipal,
} from '../../src/modules/audit/service';

function outboxRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    integrity_hash: 'a'.repeat(64),
    ...overrides,
  };
}

function insertedOutboxResult(_sql: string, params?: unknown[]) {
  return {
    rows: [outboxRow({ id: params?.[0], integrity_hash: params?.[12] })],
    rowCount: 1,
  };
}

describe('durable audit outbox', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('persists a server-scoped, PII-minimized event before materializing it', async () => {
    mockQuery
      .mockImplementationOnce(insertedOutboxResult)
      .mockResolvedValueOnce({ rows: [outboxRow()], rowCount: 1 });

    await auditService.recordEvent({
      eventType: 'knowledge_published',
      actor: 'manager-1',
      actorRole: 'manager',
      actorSource: 'signed_identity',
      resourceType: 'knowledge_document',
      resourceId: 'document-1',
      action: 'publish',
      idempotencyKey: 'knowledge:document-1:publish:2',
      correlationId: 'correlation-1',
      details: {
        category: 'procedure',
        version: 2,
        title: 'Nome e prontuario do tutor',
        reason: 'Informacao clinica livre',
        email: 'tutor@example.com',
      },
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO audit_outbox');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[1]).toBe('1');
    expect(params[3]).toBe('manager-1');
    expect(params[4]).toBe('manager');
    expect(params[5]).toBe('signed_identity');
    expect(JSON.parse(String(params[10]))).toEqual({ category: 'procedure', version: 2 });
    expect(JSON.stringify(params)).not.toContain('tutor@example.com');
    expect(JSON.stringify(params)).not.toContain('prontuario');
    expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO audit_events');
  });

  it('fails closed when the durable outbox cannot be written', async () => {
    mockQuery.mockRejectedValueOnce(new Error('audit outbox unavailable'));

    await expect(auditService.recordEvent({
      eventType: 'knowledge_published',
      actor: 'manager-1',
      actorSource: 'signed_identity',
      resourceType: 'knowledge_document',
      resourceId: 'document-1',
      action: 'publish',
    })).rejects.toThrow('audit outbox unavailable');
  });

  it('keeps a committed outbox event reconciliable when materialization fails', async () => {
    mockQuery
      .mockImplementationOnce(insertedOutboxResult)
      .mockRejectedValueOnce(new Error('audit projection unavailable'));

    await expect(auditService.recordEvent({
      eventType: 'handoff_triggered',
      actor: 'system',
      actorSource: 'trusted_service',
      resourceType: 'conversation',
      resourceId: 'conversation-1',
      action: 'handoff',
    })).resolves.toBeUndefined();

    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('writes the outbox and projection through the caller transaction', async () => {
    const client = {
      query: vi.fn()
        .mockImplementationOnce(insertedOutboxResult)
        .mockRejectedValueOnce(new Error('projection failed')),
    };

    await expect(auditService.recordEvent({
      eventType: 'knowledge_updated',
      actor: 'manager-1',
      actorSource: 'signed_identity',
      resourceType: 'knowledge_document',
      resourceId: 'document-1',
      action: 'approve',
      idempotencyKey: 'knowledge:document-1:approve:1',
    }, client)).rejects.toThrow('projection failed');

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused for different event contents', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [outboxRow({ integrity_hash: 'b'.repeat(64) })], rowCount: 1 });

    await expect(auditService.recordEvent({
      eventType: 'knowledge_rejected',
      actor: 'manager-1',
      actorSource: 'signed_identity',
      resourceType: 'knowledge_document',
      resourceId: 'document-1',
      action: 'reject',
      idempotencyKey: 'knowledge:document-1:review:1',
    })).rejects.toThrow('Audit idempotency conflict');
  });

  it('validates actor identifiers and signed-identity roles', async () => {
    await expect(auditService.recordEvent({
      eventType: 'knowledge_updated',
      actor: 'manager@example.com',
      actorSource: 'signed_identity',
      actorRole: 'manager',
      resourceType: 'knowledge_document',
      resourceId: 'document-1',
      action: 'approve',
    })).rejects.toThrow('Invalid audit actor');

    await expect(auditService.recordEvent({
      eventType: 'knowledge_updated',
      actor: 'manager-1',
      actorSource: 'signed_identity',
      actorRole: 'system',
      resourceType: 'knowledge_document',
      resourceId: 'document-1',
      action: 'approve',
    })).rejects.toThrow('Invalid signed audit actor role');

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('creates opaque principals only from bounded server identities', () => {
    const signed = createAuthenticatedAuditPrincipal({ id: 'manager-1', role: 'manager' });
    const service = createAuthenticatedAuditPrincipal({ id: 'legacy-api-service', role: 'manager' });

    expect(signed).toEqual(expect.objectContaining({
      id: 'manager-1', role: 'manager', source: 'signed_identity',
    }));
    expect(service.source).toBe('trusted_service');
    expect(Object.isFrozen(signed)).toBe(true);
    expect(() => assertAuditPrincipal({
      id: 'manager-1', role: 'manager', source: 'signed_identity',
    })).toThrow('Verified audit principal is required');
    expect(() => createAuthenticatedAuditPrincipal(undefined)).toThrow(
      'Authenticated audit principal is required'
    );
  });

  it('reconciles undispatched rows idempotently in a bounded batch', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [outboxRow(), outboxRow({ id: 'event-2' })], rowCount: 2 });

    await expect(auditService.dispatchPendingEvents(10)).resolves.toBe(2);

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE SKIP LOCKED'), ['1', 10]);
    expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT (tenant_id, outbox_event_id)');
  });

  it('verifies projected event integrity when audit records are read', async () => {
    const integrityInput = {
      tenantId: '1',
      idempotencyKey: 'knowledge:document-1:publish:2',
      eventType: 'knowledge_published' as const,
      actor: 'manager-1',
      actorRole: 'manager' as const,
      actorSource: 'signed_identity' as const,
      resourceType: 'knowledge_document',
      resourceId: 'document-1',
      action: 'publish',
      details: { category: 'faq', version: 2 },
      correlationId: 'correlation-1',
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{
        id: 'audit-1',
        tenant_id: '1',
        idempotency_key: integrityInput.idempotencyKey,
        event_type: integrityInput.eventType,
        actor: integrityInput.actor,
        actor_role: integrityInput.actorRole,
        actor_source: integrityInput.actorSource,
        resource_type: integrityInput.resourceType,
        resource_id: integrityInput.resourceId,
        action: integrityInput.action,
        details: integrityInput.details,
        correlation_id: integrityInput.correlationId,
        integrity_hash: computeAuditIntegrityHash(integrityInput),
        created_at: '2026-08-02T12:00:00.000Z',
      }], rowCount: 1 });

    const events = await auditService.getEvents({ limit: 1 });

    expect(events[0]).toEqual(expect.objectContaining({
      id: 'audit-1', integrityVerified: true, actorSource: 'signed_identity',
    }));
  });

  it('fails closed when projected audit evidence was tampered with', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{
        id: 'audit-tampered', tenant_id: '1', idempotency_key: 'event-key',
        event_type: 'knowledge_published', actor: 'manager-1', actor_role: 'manager',
        actor_source: 'signed_identity', resource_type: 'knowledge_document',
        resource_id: 'document-1', action: 'publish', details: { version: 999 },
        integrity_hash: 'a'.repeat(64), created_at: '2026-08-02T12:00:00.000Z',
      }], rowCount: 1 });

    await expect(auditService.getEvents()).rejects.toThrow(
      'Audit integrity verification failed for event audit-tampered'
    );
  });

  it('computes stable integrity evidence independent of object key order', () => {
    const common = {
      tenantId: '1',
      idempotencyKey: 'event-key',
      eventType: 'knowledge_published' as const,
      actor: 'manager-1',
      actorRole: 'manager' as const,
      actorSource: 'signed_identity' as const,
      resourceType: 'knowledge_document',
      resourceId: 'document-1',
      action: 'publish',
      correlationId: 'correlation-1',
    };

    expect(computeAuditIntegrityHash({ ...common, details: { version: 2, category: 'faq' } }))
      .toBe(computeAuditIntegrityHash({ ...common, details: { category: 'faq', version: 2 } }));
  });
});
