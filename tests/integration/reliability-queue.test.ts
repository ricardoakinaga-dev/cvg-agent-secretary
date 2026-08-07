import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import {
  assertDisposableContainer,
  boundedPositiveIntegerEnv,
  emitReliabilityMeasurement,
  requiredReliabilityEnv,
  runDocker,
  runReliabilityIntegration,
  waitUntil,
  writeReliabilityEvidence,
} from './reliability-helpers';

const describeReliability = runReliabilityIntegration ? describe.sequential : describe.skip;
const tenantId = requiredReliabilityEnv('CHATWOOT_ACCOUNT_ID');
const redisUrl = requiredReliabilityEnv('REDIS_URL');
const redisUsername = requiredReliabilityEnv('REDIS_USERNAME');
const redisPassword = requiredReliabilityEnv('REDIS_PASSWORD');
const redisContainer = requiredReliabilityEnv('RELIABILITY_REDIS_CONTAINER');
const namespacePrefix = `cvg:${tenantId}:`;
const queuePrefix = `${namespacePrefix}queue:chatwoot:webhooks`;
const maximumQueueDurationMs = boundedPositiveIntegerEnv(
  'RELIABILITY_MAX_QUEUE_DURATION_MS',
  30_000,
  300_000
);
const maximumRestartDurationMs = boundedPositiveIntegerEnv(
  'RELIABILITY_MAX_RESTART_DURATION_MS',
  60_000,
  300_000
);
const maximumRestoreDurationMs = boundedPositiveIntegerEnv(
  'RELIABILITY_MAX_RESTORE_DURATION_MS',
  120_000,
  600_000
);
const redisCheckpointWaitMs = boundedPositiveIntegerEnv(
  'RELIABILITY_REDIS_CHECKPOINT_WAIT_MS',
  1_500,
  10_000
);
const queueJobCount = boundedPositiveIntegerEnv('RELIABILITY_QUEUE_JOBS', 500, 10_000);
const restartJobCount = boundedPositiveIntegerEnv('RELIABILITY_RESTART_JOBS', 100, 2_000);
const workerCount = boundedPositiveIntegerEnv('RELIABILITY_WORKERS', 12, 100);

interface QueueJob {
  id: string;
  deliveryId: string;
  payload: {
    event: 'message_created';
    id: number;
    conversation: {
      id: number;
      inbox_id: number;
      status: 'open';
      assignee_id: null;
    };
  };
  correlationId: string;
  enqueuedAt: string;
  attempts: number;
}

interface RedisSnapshotEntry {
  key: string;
  payload: Buffer;
  ttlMs: number;
}

const evidence: Record<string, unknown> = {};
let cleanupClient: Redis | null = null;

function deliveryIdFor(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createQueueJob(index: number, suite: string): QueueJob {
  return {
    id: randomUUID(),
    deliveryId: deliveryIdFor(`${suite}:${index}`),
    payload: {
      event: 'message_created',
      id: index,
      conversation: {
        id: 10_000 + index,
        inbox_id: 1,
        status: 'open',
        assignee_id: null,
      },
    },
    correlationId: `${suite}-${index}`,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  };
}

async function scanNamespace(client: Redis): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await client.scan(
      cursor,
      'MATCH',
      `${namespacePrefix}*`,
      'COUNT',
      250
    );
    keys.push(...batch);
    cursor = nextCursor;
  } while (cursor !== '0');
  return keys.sort();
}

async function clearNamespace(client: Redis): Promise<void> {
  const keys = await scanNamespace(client);
  for (let index = 0; index < keys.length; index += 250) {
    await client.del(...keys.slice(index, index + 250));
  }
}

async function connectCleanupClient(): Promise<Redis> {
  const client = new Redis(redisUrl, {
    username: redisUsername,
    password: redisPassword,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  client.on('error', () => undefined);
  await client.connect();
  return client;
}

async function drainQueue(
  ownerPrefix: string,
  expectedJobs: number
): Promise<{
  processed: Set<string>;
  duplicateExecutions: number;
  p95QueueAgeMs: number;
  maximumQueueAgeMs: number;
}> {
  const { redisClient } = await import('../../src/shared/redis');
  const processed = new Set<string>();
  let duplicateExecutions = 0;
  let claimedCount = 0;
  const queueAgesMs: number[] = [];

  await Promise.all(Array.from({ length: workerCount }, async (_, workerIndex) => {
    const owner = `${ownerPrefix}-${workerIndex}`;
    while (true) {
      const serialized = await redisClient.claimChatwootWebhook(owner, 30_000);
      if (!serialized) {
        return;
      }
      const job = JSON.parse(serialized) as QueueJob;
      claimedCount += 1;
      queueAgesMs.push(Math.max(0, Date.now() - Date.parse(job.enqueuedAt)));
      if (processed.has(job.id)) {
        duplicateExecutions += 1;
      }
      processed.add(job.id);
      await redisClient.acknowledgeChatwootWebhook(job.id, owner);
    }
  }));

  expect(claimedCount).toBe(expectedJobs);
  const sortedQueueAges = queueAgesMs.sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(sortedQueueAges.length * 0.95) - 1);
  return {
    processed,
    duplicateExecutions,
    p95QueueAgeMs: sortedQueueAges[p95Index] ?? 0,
    maximumQueueAgeMs: sortedQueueAges.at(-1) ?? 0,
  };
}

async function captureNamespaceSnapshot(client: Redis): Promise<RedisSnapshotEntry[]> {
  const keys = await scanNamespace(client);
  const snapshot: RedisSnapshotEntry[] = [];
  for (const key of keys) {
    const dumpResult = await client.callBuffer('DUMP', key);
    if (!dumpResult) {
      continue;
    }
    if (!Buffer.isBuffer(dumpResult)) {
      throw new Error(`Redis DUMP returned an unexpected payload for ${key}`);
    }
    snapshot.push({
      key,
      payload: dumpResult,
      ttlMs: Math.max(0, await client.pttl(key)),
    });
  }
  return snapshot;
}

async function restoreNamespaceSnapshot(
  client: Redis,
  snapshot: RedisSnapshotEntry[]
): Promise<void> {
  for (const entry of snapshot) {
    await client.restore(entry.key, entry.ttlMs, entry.payload, 'REPLACE');
  }
}

describeReliability('queue concurrency, restart and Redis restore', () => {
  beforeAll(async () => {
    await assertDisposableContainer(redisContainer);
  });

  beforeEach(async () => {
    cleanupClient = await connectCleanupClient();
    await clearNamespace(cleanupClient);
    const { redisClient } = await import('../../src/shared/redis');
    await redisClient.connect();
  });

  afterEach(async () => {
    const { redisClient } = await import('../../src/shared/redis');
    if (redisClient.isReady()) {
      await clearNamespace(redisClient.getClient());
    } else if (cleanupClient?.status === 'ready') {
      await clearNamespace(cleanupClient);
    }
    await redisClient.disconnect();
    if (cleanupClient && cleanupClient.status !== 'end') {
      await cleanupClient.quit();
    }
    cleanupClient = null;
  });

  afterAll(async () => {
    await writeReliabilityEvidence('queue-redis.json', {
      suite: 'queue-concurrency-restart-and-redis-restore',
      thresholds: {
        maximumQueueDurationMs,
        maximumRestartDurationMs,
        maximumRestoreDurationMs,
        redisCheckpointWaitMs,
      },
      evidence,
    });
  });

  it('processes concurrent load exactly once and rejects repeated deliveries', {
    timeout: maximumQueueDurationMs + 30_000,
  }, async () => {
    const { redisClient } = await import('../../src/shared/redis');
    const jobs = Array.from({ length: queueJobCount }, (_, index) =>
      createQueueJob(index, 'load')
    );

    const startedAt = performance.now();
    const firstEnqueue = await Promise.all(jobs.map((job) =>
      redisClient.enqueueChatwootWebhookOnce(JSON.stringify(job), job.deliveryId, 3_600)
    ));
    const repeatedEnqueue = await Promise.all(jobs.map((job) =>
      redisClient.enqueueChatwootWebhookOnce(JSON.stringify(job), job.deliveryId, 3_600)
    ));
    const result = await drainQueue('load-worker', jobs.length);
    const durationMs = Math.ceil(performance.now() - startedAt);
    const throughputPerSecond = Number((jobs.length / (durationMs / 1_000)).toFixed(2));

    expect(firstEnqueue.every(Boolean)).toBe(true);
    expect(repeatedEnqueue.some(Boolean)).toBe(false);
    expect(result.processed.size).toBe(jobs.length);
    expect(result.duplicateExecutions).toBe(0);
    expect(durationMs).toBeLessThanOrEqual(maximumQueueDurationMs);
    expect(result.p95QueueAgeMs).toBeLessThanOrEqual(maximumQueueDurationMs);

    evidence.concurrentLoad = {
      jobs: jobs.length,
      workers: workerCount,
      durationMs,
      throughputPerSecond,
      lost: jobs.length - result.processed.size,
      duplicateExecutions: result.duplicateExecutions,
      p95QueueAgeMs: result.p95QueueAgeMs,
      maximumQueueAgeMs: result.maximumQueueAgeMs,
      duplicateDeliveriesRejected: repeatedEnqueue.length,
      passed: true,
    };
    emitReliabilityMeasurement('concurrent-queue-load', evidence.concurrentLoad as Record<string, unknown>);
  });

  it('keeps the AOF replay identity authenticated and least privileged', async () => {
    const unauthenticated = new Redis(redisUrl, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
    });
    const replayIdentity = new Redis(redisUrl, {
      username: 'default',
      password: redisPassword,
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
    });
    unauthenticated.on('error', () => undefined);
    replayIdentity.on('error', () => undefined);

    try {
      await unauthenticated.connect();
      await expect(unauthenticated.get(`${namespacePrefix}acl-probe`))
        .rejects.toThrow(/NOAUTH/i);

      await replayIdentity.connect();
      const replayProbeKey = `${namespacePrefix}aof-replay-probe`;
      expect(await replayIdentity.set(replayProbeKey, 'allowed')).toBe('OK');
      await expect(replayIdentity.set('outside-approved-namespace', 'forbidden'))
        .rejects.toThrow(/NOPERM/i);
      await expect(replayIdentity.config('GET', 'appendonly'))
        .rejects.toThrow(/NOPERM/i);
      expect(await replayIdentity.del(replayProbeKey)).toBe(1);

      evidence.redisReplayAcl = {
        authenticationRequired: true,
        namespaceRestricted: true,
        administrativeCommandsDenied: true,
        passed: true,
      };
      emitReliabilityMeasurement('redis-aof-replay-acl', evidence.redisReplayAcl as Record<string, unknown>);
    } finally {
      unauthenticated.disconnect();
      replayIdentity.disconnect();
    }
  });

  it('survives a Redis restart and recovers every expired lease without duplication', {
    timeout: maximumRestartDurationMs + maximumQueueDurationMs + 30_000,
  }, async () => {
    const { redisClient } = await import('../../src/shared/redis');
    const jobs = Array.from({ length: restartJobCount }, (_, index) =>
      createQueueJob(index, 'restart')
    );
    await Promise.all(jobs.map((job) =>
      redisClient.enqueueChatwootWebhookOnce(JSON.stringify(job), job.deliveryId, 3_600)
    ));

    const crashOwner = 'worker-terminated-before-ack';
    const abandonedJobCount = Math.max(1, Math.min(25, Math.floor(jobs.length / 4)));
    for (let index = 0; index < abandonedJobCount; index += 1) {
      expect(await redisClient.claimChatwootWebhook(crashOwner, 5_000, 1_000)).not.toBeNull();
    }
    const keysAtCheckpoint = await scanNamespace(redisClient.getClient());
    expect(keysAtCheckpoint.length).toBeGreaterThan(0);
    const persistenceBeforeRestart = await redisClient.getClient().info('persistence');
    expect(persistenceBeforeRestart).toContain('aof_enabled:1');
    // The deployed Redis policy uses appendfsync everysec. The explicit wait
    // establishes the durable checkpoint and makes the tested RPO visible.
    await new Promise((resolve) => setTimeout(resolve, redisCheckpointWaitMs));
    await redisClient.disconnect();
    if (cleanupClient && cleanupClient.status !== 'end') {
      await cleanupClient.quit();
      cleanupClient = null;
    }

    const restartStartedAt = performance.now();
    await runDocker(['restart', '--timeout', '10', redisContainer], maximumRestartDurationMs);
    await waitUntil(async () => {
      try {
        await redisClient.connect();
        return await redisClient.ping();
      } catch {
        await redisClient.disconnect().catch(() => undefined);
        return false;
      }
    }, maximumRestartDurationMs);
    const restartDurationMs = Math.ceil(performance.now() - restartStartedAt);

    const keysAfterRestart = await scanNamespace(redisClient.getClient());
    const persistenceAfterRestart = await redisClient.getClient().info('persistence');
    const redisLogs = await runDocker(['logs', '--tail', '80', redisContainer]);
    const stateAfterRestart = {
      keysAtCheckpoint: keysAtCheckpoint.length,
      keysAfterRestart: keysAfterRestart.length,
      pending: await redisClient.getClient().llen(`${queuePrefix}:pending`),
      inflight: await redisClient.getClient().hlen(`${queuePrefix}:inflight`),
      leases: await redisClient.getClient().zcard(`${queuePrefix}:leases`),
      aofEnabled: persistenceAfterRestart.includes('aof_enabled:1'),
    };
    emitReliabilityMeasurement('redis-restart-durable-state', stateAfterRestart);
    expect(`${redisLogs.stdout}${redisLogs.stderr}`).not.toContain('CRITICAL');
    if (keysAfterRestart.length === 0) {
      process.stderr.write(`[reliability] Redis restart logs:\n${redisLogs.stdout}${redisLogs.stderr}`);
    }
    expect(keysAfterRestart).toEqual(keysAtCheckpoint);
    const recoveredLeases = await redisClient.recoverExpiredChatwootWebhooks(6_000);
    const result = await drainQueue('restart-worker', jobs.length);

    expect(restartDurationMs).toBeLessThanOrEqual(maximumRestartDurationMs);
    expect(recoveredLeases).toBe(abandonedJobCount);
    expect(result.processed.size).toBe(jobs.length);
    expect(result.duplicateExecutions).toBe(0);
    expect(result.p95QueueAgeMs).toBeLessThanOrEqual(maximumQueueDurationMs);

    evidence.restartRecovery = {
      jobs: jobs.length,
      abandonedLeases: abandonedJobCount,
      recoveredLeases,
      restartDurationMs,
      checkpointWaitMs: redisCheckpointWaitMs,
      measuredRpoUpperBoundMs: redisCheckpointWaitMs,
      keysAtCheckpoint: keysAtCheckpoint.length,
      lost: jobs.length - result.processed.size,
      duplicateExecutions: result.duplicateExecutions,
      p95QueueAgeMs: result.p95QueueAgeMs,
      maximumQueueAgeMs: result.maximumQueueAgeMs,
      passed: true,
    };
    emitReliabilityMeasurement('redis-restart-lease-recovery', evidence.restartRecovery as Record<string, unknown>);
  });

  it('restores all Redis queue structures to the exact checkpoint boundary', {
    timeout: maximumRestoreDurationMs + 30_000,
  }, async () => {
    const { redisClient } = await import('../../src/shared/redis');
    const client = redisClient.getClient();
    const jobs = Array.from({ length: 6 }, (_, index) => createQueueJob(index, 'restore'));
    await Promise.all(jobs.map((job) =>
      redisClient.enqueueChatwootWebhookOnce(JSON.stringify(job), job.deliveryId, 3_600)
    ));

    const inflight = await redisClient.claimChatwootWebhook('restore-inflight-owner', 60_000);
    expect(inflight).not.toBeNull();
    const delayed = await redisClient.claimChatwootWebhook('restore-delayed-owner', 60_000);
    expect(delayed).not.toBeNull();
    const delayedJob = JSON.parse(delayed as string) as QueueJob;
    await redisClient.requeueChatwootWebhook(
      delayedJob.id,
      'restore-delayed-owner',
      JSON.stringify({ ...delayedJob, attempts: 1 }),
      60_000
    );
    const failed = await redisClient.claimChatwootWebhook('restore-failed-owner', 60_000);
    expect(failed).not.toBeNull();
    const failedJob = JSON.parse(failed as string) as QueueJob;
    await redisClient.failChatwootWebhook(
      failedJob.id,
      'restore-failed-owner',
      JSON.stringify({ id: failedJob.id, error: 'synthetic reliability failure' })
    );

    const checkpoint = await captureNamespaceSnapshot(client);
    const checkpointKeys = checkpoint.map((entry) => entry.key).sort();
    expect(checkpointKeys).toEqual(expect.arrayContaining([
      `${queuePrefix}:pending`,
      `${queuePrefix}:inflight`,
      `${queuePrefix}:leases`,
      `${queuePrefix}:delayed`,
      `${queuePrefix}:failed`,
    ]));

    const postCheckpointJob = createQueueJob(999_999, 'after-checkpoint');
    await redisClient.enqueueChatwootWebhookOnce(
      JSON.stringify(postCheckpointJob),
      postCheckpointJob.deliveryId,
      3_600
    );
    await clearNamespace(client);

    const restoreStartedAt = performance.now();
    await restoreNamespaceSnapshot(client, checkpoint);
    const restoreDurationMs = Math.ceil(performance.now() - restoreStartedAt);
    const restoredKeys = await scanNamespace(client);
    const restoredValues = await Promise.all(restoredKeys.map(async (key) => {
      const type = await client.type(key);
      if (type === 'string') return client.get(key);
      if (type === 'list') return (await client.lrange(key, 0, -1)).join('\n');
      if (type === 'hash') return JSON.stringify(await client.hgetall(key));
      if (type === 'zset') return (await client.zrange(key, 0, -1)).join('\n');
      return '';
    }));

    expect(restoreDurationMs).toBeLessThanOrEqual(maximumRestoreDurationMs);
    expect(restoredKeys).toEqual(checkpointKeys);
    expect(restoredValues.join('\n')).not.toContain(postCheckpointJob.id);

    evidence.redisRestore = {
      checkpointKeys: checkpoint.length,
      restoredKeys: restoredKeys.length,
      restoreDurationMs,
      rpoLostCheckpointWrites: 0,
      postCheckpointWritesRestored: 0,
      passed: true,
    };
    emitReliabilityMeasurement('redis-namespace-restore', evidence.redisRestore as Record<string, unknown>);
  });
});
