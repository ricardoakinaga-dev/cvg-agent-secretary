import { z } from 'zod';
import { config } from '../../config';
import {
  AttestedNoPersonalDataAdapter,
  PostgresPrivacyStoreAdapter,
} from './adapters';
import { PostgresPrivacyAuditAdapter } from './audit-adapter';
import { createPostgresPrivacyGateway } from './postgres-gateway';
import { createPrivacyRouter } from './routes';
import { ConfiguredPrivacyRecoveryAdapter, runtimeRedisPrivacyAdapter } from './runtime-adapters';
import { PrivacyLifecycleService } from './service';

const policiesSchema = z.array(z.object({
  id: z.string(),
  store: z.enum(['postgres', 'redis', 'qdrant', 'logs']),
  resource: z.string(),
  retentionDays: z.number(),
  batchSize: z.number(),
})).min(1);

export function createPrivacyService(): PrivacyLifecycleService {
  let rawPolicies: unknown;
  try {
    rawPolicies = JSON.parse(config.privacy.retentionPoliciesJson);
  } catch {
    throw new Error('Privacy retention policy is invalid JSON');
  }
  const policies = policiesSchema.parse(rawPolicies);
  const gateway = createPostgresPrivacyGateway();
  const service = new PrivacyLifecycleService({
    stores: {
      postgres: new PostgresPrivacyStoreAdapter(gateway),
      redis: runtimeRedisPrivacyAdapter(gateway),
      qdrant: new AttestedNoPersonalDataAdapter(
        'qdrant',
        config.privacy.qdrantAttestationId
      ),
      logs: new AttestedNoPersonalDataAdapter('logs', config.privacy.logsAttestationId),
    },
    audit: new PostgresPrivacyAuditAdapter(gateway),
    recovery: new ConfiguredPrivacyRecoveryAdapter(config.privacy.recoveryCheckpointsJson),
    policies,
  });

  return service;
}

export function createPrivacyRuntime() {
  return createPrivacyRouter(createPrivacyService(), () => config.chatwoot.accountId);
}

export async function runAutomatedRetentionPurge(now = new Date()): Promise<void> {
  if (!config.privacy.enabled || !config.privacy.automaticPurgeEnabled) return;

  let checkpoints: unknown;
  try {
    checkpoints = JSON.parse(config.privacy.recoveryCheckpointsJson);
  } catch {
    throw new Error('Privacy recovery checkpoints are invalid JSON');
  }
  const checkpoint = Array.isArray(checkpoints)
    ? checkpoints.find((candidate) => (
      candidate
      && typeof candidate === 'object'
      && (candidate as Record<string, unknown>).tenantId === config.chatwoot.accountId
      && (candidate as Record<string, unknown>).verified === true
    )) as Record<string, unknown> | undefined
    : undefined;
  if (!checkpoint || typeof checkpoint.id !== 'string') {
    throw new Error('No verified privacy recovery checkpoint is configured for the tenant');
  }

  const service = createPrivacyService();
  const day = now.toISOString().slice(0, 10);
  const actorId = 'privacy-retention-scheduler';
  const preview = await service.previewRetention({
    tenantId: config.chatwoot.accountId,
    actorId,
    idempotencyKey: `privacy:preview:${day}`,
  });
  await service.purgeRetention({
    tenantId: config.chatwoot.accountId,
    actorId,
    idempotencyKey: `privacy:purge:${day}`,
    approvedPreviewReceiptId: preview.receipt.id,
    recoveryCheckpointId: checkpoint.id,
    confirm: true,
  });
}
