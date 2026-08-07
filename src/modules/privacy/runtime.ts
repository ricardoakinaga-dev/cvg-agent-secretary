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

export function createPrivacyRuntime() {
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

  return createPrivacyRouter(service, () => config.chatwoot.accountId);
}
