import { z } from 'zod';
import {
  PrivacyAuditAdapter,
  PrivacyOperationKind,
  PrivacyOperationReceipt,
  PrivacyRecoveryAdapter,
  PrivacyStoreAdapters,
  RetentionPolicy,
  StoreMutationResult,
  StoreName,
  StoreOperationContext,
  StorePreviewResult,
  SubjectStoreContext,
} from './types';
import { privacyDigest } from './evidence';

const storeNames: StoreName[] = ['postgres', 'redis', 'qdrant', 'logs'];
const tenantIdSchema = z.string().regex(/^[1-9]\d{0,18}$/);
const actorIdSchema = z.string().trim().min(1).max(200);
const idempotencyKeySchema = z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9._:-]+$/);
const contactIdSchema = z.string().uuid();

const operationRequestSchema = z.object({
  tenantId: tenantIdSchema,
  actorId: actorIdSchema,
  idempotencyKey: idempotencyKeySchema,
});

const subjectRequestSchema = operationRequestSchema.extend({
  contactId: contactIdSchema,
});

const destructiveSubjectRequestSchema = subjectRequestSchema.extend({
  confirm: z.literal(true),
  recoveryCheckpointId: z.string().trim().min(8).max(200).regex(/^[a-zA-Z0-9._:-]+$/),
});

const purgeRequestSchema = operationRequestSchema.extend({
  approvedPreviewReceiptId: z.string().trim().min(1).max(200),
  recoveryCheckpointId: z.string().trim().min(8).max(200).regex(/^[a-zA-Z0-9._:-]+$/),
  confirm: z.literal(true),
});

export type PrivacyOperationRequest = z.infer<typeof operationRequestSchema>;
export type SubjectOperationRequest = z.infer<typeof subjectRequestSchema>;
export type DestructiveSubjectRequest = z.infer<typeof destructiveSubjectRequestSchema>;
export type PurgeRetentionRequest = z.infer<typeof purgeRequestSchema>;

interface ServiceDependencies {
  stores: PrivacyStoreAdapters;
  audit: PrivacyAuditAdapter;
  recovery: PrivacyRecoveryAdapter;
  policies: RetentionPolicy[];
  now?: () => Date;
}

interface PreviewResult extends StorePreviewResult {
  policyId: string;
  store: StoreName;
  resource: string;
  cutoff: string;
}

interface PurgeResult extends StoreMutationResult {
  policyId: string;
  store: StoreName;
  resource: string;
}

interface AuditedResult<T> {
  receipt: PrivacyOperationReceipt;
  value?: T;
  replayed: boolean;
}

export class PrivacyOperationError extends Error {
  readonly code: string;

  constructor(message: string, code = 'PRIVACY_OPERATION_FAILED') {
    super(message);
    this.name = 'PrivacyOperationError';
    this.code = code;
  }
}

function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new PrivacyOperationError('Invalid privacy operation request', 'PRIVACY_REQUEST_INVALID');
  }
  return parsed.data;
}

function validatePolicies(policies: RetentionPolicy[]): RetentionPolicy[] {
  const schema = z.array(z.object({
    id: z.string().trim().min(1).max(100).regex(/^[a-z0-9_-]+$/),
    store: z.enum(['postgres', 'redis', 'qdrant', 'logs']),
    resource: z.string().trim().min(1).max(100).regex(/^[a-z0-9_-]+$/),
    retentionDays: z.number().int().positive().max(3650),
    batchSize: z.number().int().positive().max(10_000),
  })).min(1);
  const parsed = schema.safeParse(policies);
  if (!parsed.success) {
    throw new Error('At least one valid retention policy is required');
  }
  const ids = new Set(parsed.data.map((policy) => policy.id));
  if (ids.size !== parsed.data.length) {
    throw new Error('Retention policy ids must be unique');
  }
  return parsed.data;
}

function ensureStores(stores: PrivacyStoreAdapters): void {
  for (const name of storeNames) {
    if (!stores[name] || stores[name].name !== name) {
      throw new Error(`Privacy store adapter ${name} is required`);
    }
  }
}

export class PrivacyLifecycleService {
  private readonly stores: PrivacyStoreAdapters;
  private readonly audit: PrivacyAuditAdapter;
  private readonly policies: RetentionPolicy[];
  private readonly recovery: PrivacyRecoveryAdapter;
  private readonly now: () => Date;

  constructor(dependencies: ServiceDependencies) {
    ensureStores(dependencies.stores);
    this.stores = dependencies.stores;
    this.audit = dependencies.audit;
    this.recovery = dependencies.recovery;
    this.policies = validatePolicies(dependencies.policies);
    this.now = dependencies.now || (() => new Date());
  }

  async previewRetention(input: PrivacyOperationRequest): Promise<{
    receipt: PrivacyOperationReceipt;
    results: PreviewResult[];
  }> {
    const request = parseRequest(operationRequestSchema, input);
    const asOf = this.now();
    const scope = this.retentionScope(asOf);
    const execution = await this.executeAudited(
      'retention_preview',
      request,
      privacyDigest(scope),
      async (operationId) => {
        const results: PreviewResult[] = [];
        for (const policy of this.policies) {
          const cutoff = this.cutoff(asOf, policy.retentionDays);
          const result = await this.stores[policy.store].previewRetention({
            operationId,
            tenantId: request.tenantId,
            actorId: request.actorId,
            operation: 'retention_preview',
            policyId: policy.id,
            resource: policy.resource,
            cutoff,
            batchSize: policy.batchSize,
          });
          results.push({
            policyId: policy.id,
            store: policy.store,
            resource: policy.resource,
            cutoff: cutoff.toISOString(),
            matched: result.matched,
          });
        }
        return results;
      },
      (results) => ({
        asOf: asOf.toISOString(),
        policies: results.length,
        matched: results.reduce((total, result) => total + result.matched, 0),
      })
    );

    return {
      receipt: execution.receipt,
      results: execution.value || [],
    };
  }

  async purgeRetention(input: PurgeRetentionRequest): Promise<{
    receipt: PrivacyOperationReceipt;
    results: PurgeResult[];
  }> {
    const request = parseRequest(purgeRequestSchema, input);
    const preview = await this.audit.findById(request.tenantId, request.approvedPreviewReceiptId);
    if (!preview || preview.kind !== 'retention_preview' || preview.status !== 'completed') {
      throw new PrivacyOperationError(
        'A completed retention preview receipt is required',
        'PRIVACY_PREVIEW_REQUIRED'
      );
    }

    const checkpointValid = await this.recovery.verifyCheckpoint({
      tenantId: request.tenantId,
      checkpointId: request.recoveryCheckpointId,
      createdBefore: new Date(preview.createdAt),
    });
    if (!checkpointValid) {
      throw new PrivacyOperationError(
        'A verified recovery checkpoint is required',
        'PRIVACY_RECOVERY_CHECKPOINT_INVALID'
      );
    }

    const asOfValue = preview.summary.asOf;
    const asOf = typeof asOfValue === 'string' ? new Date(asOfValue) : new Date(Number.NaN);
    if (Number.isNaN(asOf.getTime()) || preview.scopeHash !== privacyDigest(this.retentionScope(asOf))) {
      throw new PrivacyOperationError(
        'Retention policy changed after preview; run a new preview',
        'PRIVACY_PREVIEW_STALE'
      );
    }

    const scopeHash = privacyDigest({
      preview: preview.id,
      recoveryCheckpointId: request.recoveryCheckpointId,
      policyScope: this.retentionScope(asOf),
    });
    const execution = await this.executeAudited(
      'retention_purge',
      request,
      scopeHash,
      async (operationId, completedStores) => {
        const participating = Array.from(new Set(this.policies.map((policy) => policy.store)));
        await this.preflightStores(participating, {
          operationId,
          tenantId: request.tenantId,
          actorId: request.actorId,
          operation: 'retention_purge',
        });

        const results: PurgeResult[] = [];
        for (const policy of this.policies) {
          const result = await this.stores[policy.store].purgeRetention({
            operationId,
            tenantId: request.tenantId,
            actorId: request.actorId,
            operation: 'retention_purge',
            policyId: policy.id,
            resource: policy.resource,
            cutoff: this.cutoff(asOf, policy.retentionDays),
            batchSize: policy.batchSize,
          });
          results.push({
            policyId: policy.id,
            store: policy.store,
            resource: policy.resource,
            affected: result.affected,
          });
          if (!completedStores.includes(policy.store)) {
            completedStores.push(policy.store);
          }
        }
        return results;
      },
      (results) => ({
        approvedPreviewReceiptId: preview.id,
        recoveryCheckpointId: request.recoveryCheckpointId,
        policies: results.length,
        affected: results.reduce((total, result) => total + result.affected, 0),
      })
    );

    return { receipt: execution.receipt, results: execution.value || [] };
  }

  async exportSubject(input: SubjectOperationRequest): Promise<{
    receipt: PrivacyOperationReceipt;
    data: Record<StoreName, unknown>;
  }> {
    const request = parseRequest(subjectRequestSchema, input);
    const scopeHash = this.subjectScopeHash(request.tenantId, request.contactId);
    const execution = await this.executeAudited(
      'subject_export',
      request,
      scopeHash,
      async (operationId) => {
        const context = this.subjectContext('subject_export', operationId, request);
        await this.preflightStores(storeNames, context);
        const entries = await Promise.all(storeNames.map(async (name) => [
          name,
          await this.stores[name].exportSubject(context),
        ] as const));
        return Object.fromEntries(entries) as Record<StoreName, unknown>;
      },
      (data) => ({ stores: Object.keys(data).length })
    );

    if (!execution.value) {
      throw new PrivacyOperationError(
        'Export was already completed; use a new idempotency key for a fresh export',
        'PRIVACY_EXPORT_REPLAY'
      );
    }
    return { receipt: execution.receipt, data: execution.value };
  }

  async anonymizeSubject(input: DestructiveSubjectRequest): Promise<{
    receipt: PrivacyOperationReceipt;
    results: Record<StoreName, StoreMutationResult>;
  }> {
    return this.mutateSubject('subject_anonymize', input, 'anonymizeSubject');
  }

  async eraseSubject(input: DestructiveSubjectRequest): Promise<{
    receipt: PrivacyOperationReceipt;
    results: Record<StoreName, StoreMutationResult>;
  }> {
    return this.mutateSubject('subject_erase', input, 'eraseSubject');
  }

  private async mutateSubject(
    kind: 'subject_anonymize' | 'subject_erase',
    input: DestructiveSubjectRequest,
    method: 'anonymizeSubject' | 'eraseSubject'
  ): Promise<{
    receipt: PrivacyOperationReceipt;
    results: Record<StoreName, StoreMutationResult>;
  }> {
    const request = parseRequest(destructiveSubjectRequestSchema, input);
    const checkpointValid = await this.recovery.verifyCheckpoint({
      tenantId: request.tenantId,
      checkpointId: request.recoveryCheckpointId,
      createdBefore: this.now(),
    });
    if (!checkpointValid) {
      throw new PrivacyOperationError(
        'A verified recovery checkpoint is required',
        'PRIVACY_RECOVERY_CHECKPOINT_INVALID'
      );
    }
    const execution = await this.executeAudited(
      kind,
      request,
      privacyDigest({
        subjectScope: this.subjectScopeHash(request.tenantId, request.contactId),
        recoveryCheckpointId: request.recoveryCheckpointId,
      }),
      async (operationId, completedStores) => {
        const context = this.subjectContext(kind, operationId, request);
        await this.preflightStores(storeNames, context);
        const results = {} as Record<StoreName, StoreMutationResult>;
        for (const name of storeNames) {
          results[name] = await this.stores[name][method](context);
          completedStores.push(name);
        }
        return results;
      },
      (results) => ({
        stores: Object.keys(results).length,
        affected: Object.values(results).reduce((total, result) => total + result.affected, 0),
      })
    );

    return { receipt: execution.receipt, results: execution.value || this.emptyMutationResults() };
  }

  private async executeAudited<T>(
    kind: PrivacyOperationKind,
    request: PrivacyOperationRequest,
    scopeHash: string,
    execute: (operationId: string, completedStores: StoreName[]) => Promise<T>,
    summarize: (value: T) => Record<string, number | string>
  ): Promise<AuditedResult<T>> {
    const existing = await this.audit.findCompleted(request.tenantId, request.idempotencyKey);
    if (existing) {
      if (existing.kind !== kind || existing.scopeHash !== scopeHash) {
        throw new PrivacyOperationError(
          'Idempotency key was already used for a different operation',
          'PRIVACY_IDEMPOTENCY_CONFLICT'
        );
      }
      return { receipt: existing, replayed: true };
    }

    const startedAt = this.now().toISOString();
    let started: { operationId: string };
    try {
      started = await this.audit.begin({
        tenantId: request.tenantId,
        actorId: request.actorId,
        idempotencyKey: request.idempotencyKey,
        kind,
        scopeHash,
        startedAt,
      });
    } catch {
      throw new PrivacyOperationError(
        'Privacy operation could not be claimed',
        'PRIVACY_OPERATION_BUSY'
      );
    }
    const completedStores: StoreName[] = [];
    try {
      const value = await execute(started.operationId, completedStores);
      const receiptBase = {
        id: started.operationId,
        operationId: started.operationId,
        tenantId: request.tenantId,
        idempotencyKey: request.idempotencyKey,
        kind,
        status: 'completed' as const,
        actorId: request.actorId,
        createdAt: this.now().toISOString(),
        scopeHash,
        summary: summarize(value),
      };
      const receipt: PrivacyOperationReceipt = {
        ...receiptBase,
        evidenceHash: privacyDigest(receiptBase),
      };
      return {
        receipt: await this.audit.complete(receipt),
        value,
        replayed: false,
      };
    } catch {
      try {
        await this.audit.fail({
          operationId: started.operationId,
          tenantId: request.tenantId,
          idempotencyKey: request.idempotencyKey,
          kind,
          code: 'PRIVACY_STORE_OPERATION_FAILED',
          completedStores,
          failedAt: this.now().toISOString(),
        });
      } catch {
        // The caller still receives a failure. Reconciliation uses operationId in the durable begin event.
      }
      throw new PrivacyOperationError(
        'Privacy operation failed; no success receipt was issued',
        'PRIVACY_STORE_OPERATION_FAILED'
      );
    }
  }

  private async preflightStores(
    names: StoreName[],
    context: StoreOperationContext
  ): Promise<void> {
    await Promise.all(names.map((name) => this.stores[name].preflight(context)));
  }

  private subjectContext(
    kind: 'subject_export' | 'subject_anonymize' | 'subject_erase',
    operationId: string,
    request: SubjectOperationRequest
  ): SubjectStoreContext {
    return {
      operationId,
      tenantId: request.tenantId,
      actorId: request.actorId,
      operation: kind,
      contactId: request.contactId,
    };
  }

  private subjectScopeHash(tenantId: string, contactId: string): string {
    return privacyDigest({ tenantId, subject: contactId });
  }

  private retentionScope(asOf: Date): unknown {
    return {
      asOf: asOf.toISOString(),
      policies: this.policies.map((policy) => ({ ...policy })),
    };
  }

  private cutoff(asOf: Date, retentionDays: number): Date {
    return new Date(asOf.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  }

  private emptyMutationResults(): Record<StoreName, StoreMutationResult> {
    return Object.fromEntries(storeNames.map((name) => [name, { affected: 0 }])) as Record<
      StoreName,
      StoreMutationResult
    >;
  }
}
