export type StoreName = 'postgres' | 'redis' | 'qdrant' | 'logs';

export type PrivacyOperationKind =
  | 'retention_preview'
  | 'retention_purge'
  | 'subject_export'
  | 'subject_anonymize'
  | 'subject_erase';

export interface RetentionPolicy {
  id: string;
  store: StoreName;
  resource: string;
  retentionDays: number;
  batchSize: number;
}

export interface StoreOperationContext {
  operationId: string;
  tenantId: string;
  actorId: string;
  operation: PrivacyOperationKind;
}

export interface RetentionStoreContext extends StoreOperationContext {
  policyId: string;
  resource: string;
  cutoff: Date;
  batchSize: number;
}

export interface SubjectStoreContext extends StoreOperationContext {
  contactId: string;
}

export interface StorePreviewResult {
  matched: number;
}

export interface StoreMutationResult {
  affected: number;
}

export interface PrivacyStoreAdapter {
  readonly name: StoreName;
  preflight(context: StoreOperationContext): Promise<void>;
  previewRetention(context: RetentionStoreContext): Promise<StorePreviewResult>;
  purgeRetention(context: RetentionStoreContext): Promise<StoreMutationResult>;
  exportSubject(context: SubjectStoreContext): Promise<unknown>;
  anonymizeSubject(context: SubjectStoreContext): Promise<StoreMutationResult>;
  eraseSubject(context: SubjectStoreContext): Promise<StoreMutationResult>;
}

export interface PrivacyOperationReceipt {
  id: string;
  operationId: string;
  tenantId: string;
  idempotencyKey: string;
  kind: PrivacyOperationKind;
  status: 'completed';
  actorId: string;
  createdAt: string;
  scopeHash: string;
  evidenceHash: string;
  summary: Record<string, number | string>;
}

export interface PrivacyAuditStart {
  tenantId: string;
  actorId: string;
  idempotencyKey: string;
  kind: PrivacyOperationKind;
  scopeHash: string;
  startedAt: string;
}

export interface PrivacyAuditFailure {
  operationId: string;
  tenantId: string;
  idempotencyKey: string;
  kind: PrivacyOperationKind;
  code: 'PRIVACY_STORE_OPERATION_FAILED';
  completedStores: StoreName[];
  failedAt: string;
}

export interface PrivacyAuditAdapter {
  findCompleted(
    tenantId: string,
    idempotencyKey: string
  ): Promise<PrivacyOperationReceipt | undefined>;
  findById(tenantId: string, receiptId: string): Promise<PrivacyOperationReceipt | undefined>;
  begin(event: PrivacyAuditStart): Promise<{ operationId: string }>;
  complete(receipt: PrivacyOperationReceipt): Promise<PrivacyOperationReceipt>;
  fail(event: PrivacyAuditFailure): Promise<void>;
}

export interface PrivacyRecoveryAdapter {
  verifyCheckpoint(input: {
    tenantId: string;
    checkpointId: string;
    createdBefore: Date;
  }): Promise<boolean>;
}

export interface PrivacyStoreAdapters {
  postgres: PrivacyStoreAdapter;
  redis: PrivacyStoreAdapter;
  qdrant: PrivacyStoreAdapter;
  logs: PrivacyStoreAdapter;
}
