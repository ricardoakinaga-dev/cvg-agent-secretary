import { randomUUID } from 'node:crypto';
import {
  assertDisposableContainer,
  boundedPositiveIntegerEnv,
  emitReliabilityMeasurement,
  requiredReliabilityEnv,
  runReliabilityIntegration,
  writeReliabilityEvidence,
} from './reliability-helpers';

const describeReliability = runReliabilityIntegration ? describe.sequential : describe.skip;
const qdrantUrl = requiredReliabilityEnv('QDRANT_URL').replace(/\/$/, '');
const qdrantContainer = requiredReliabilityEnv('RELIABILITY_QDRANT_CONTAINER');
const tenantId = requiredReliabilityEnv('CHATWOOT_ACCOUNT_ID');
const maximumRestoreDurationMs = boundedPositiveIntegerEnv(
  'RELIABILITY_MAX_RESTORE_DURATION_MS',
  120_000,
  600_000
);
const qdrantPointCount = boundedPositiveIntegerEnv(
  'RELIABILITY_QDRANT_POINTS',
  250,
  10_000
);
const collection = `cvg_reliability_${randomUUID().replaceAll('-', '')}`
  .toLowerCase()
  .replace(/[^a-z0-9_]/g, '_')
  .slice(0, 120);

interface QdrantResponse<T> {
  result: T;
  status: string;
}

interface QdrantSnapshot {
  name: string;
}

interface QdrantScrollResult {
  points: Array<{
    id: string;
    payload: Record<string, unknown>;
  }>;
  next_page_offset?: string | null;
}

const evidence: Record<string, unknown> = {};

async function qdrantRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${qdrantUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(maximumRestoreDurationMs),
  });
  if (!response.ok) {
    throw new Error(`Qdrant reliability request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function deleteCollection(): Promise<void> {
  const response = await fetch(`${qdrantUrl}/collections/${collection}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Unable to remove Qdrant reliability collection (${response.status})`);
  }
}

async function scrollAllPoints(): Promise<QdrantScrollResult['points']> {
  const points: QdrantScrollResult['points'] = [];
  let offset: string | null | undefined;
  do {
    const response = await qdrantRequest<QdrantResponse<QdrantScrollResult>>(
      `/collections/${collection}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 256,
          offset: offset ?? undefined,
          with_payload: true,
          with_vector: false,
        }),
      }
    );
    points.push(...response.result.points);
    offset = response.result.next_page_offset;
  } while (offset !== null && offset !== undefined);
  return points;
}

describeReliability('Qdrant native snapshot restore', () => {
  beforeAll(async () => {
    await assertDisposableContainer(qdrantContainer);
  });

  beforeEach(deleteCollection);
  afterEach(deleteCollection);

  afterAll(async () => {
    await writeReliabilityEvidence('qdrant.json', {
      suite: 'qdrant-native-snapshot-restore',
      thresholds: { maximumRestoreDurationMs },
      evidence,
    });
  });

  it('restores every checkpoint point and excludes post-checkpoint writes', {
    timeout: maximumRestoreDurationMs * 2 + 60_000,
  }, async () => {
    await qdrantRequest(`/collections/${collection}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: 4, distance: 'Cosine' },
      }),
    });

    const checkpointPoints = Array.from({ length: qdrantPointCount }, (_, index) => ({
      id: randomUUID(),
      vector: [1, index / qdrantPointCount, 0, 0],
      payload: {
        tenant_id: tenantId,
        reliability_sequence: index,
        checkpoint: true,
      },
    }));
    await qdrantRequest(`/collections/${collection}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: checkpointPoints }),
    });

    const snapshotResponse = await qdrantRequest<QdrantResponse<QdrantSnapshot>>(
      `/collections/${collection}/snapshots?wait=true`,
      { method: 'POST' }
    );
    const snapshotName = snapshotResponse.result.name;
    expect(snapshotName).toMatch(/\.snapshot$/);
    const snapshotDownload = await fetch(
      `${qdrantUrl}/collections/${collection}/snapshots/${encodeURIComponent(snapshotName)}`,
      { signal: AbortSignal.timeout(maximumRestoreDurationMs) }
    );
    expect(snapshotDownload.ok).toBe(true);
    const snapshot = await snapshotDownload.arrayBuffer();

    const postCheckpointPoint = {
      id: randomUUID(),
      vector: [0, 0, 0, 1],
      payload: {
        tenant_id: tenantId,
        reliability_sequence: qdrantPointCount + 1,
        checkpoint: false,
      },
    };
    await qdrantRequest(`/collections/${collection}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [postCheckpointPoint] }),
    });
    await deleteCollection();

    const restoreStartedAt = performance.now();
    const form = new FormData();
    form.append('snapshot', new Blob([snapshot]), snapshotName);
    await qdrantRequest(
      `/collections/${collection}/snapshots/upload?wait=true&priority=snapshot`,
      { method: 'POST', body: form }
    );
    const restoreDurationMs = Math.ceil(performance.now() - restoreStartedAt);
    const restoredPoints = await scrollAllPoints();
    const restoredIds = new Set(restoredPoints.map((point) => point.id));

    expect(restoreDurationMs).toBeLessThanOrEqual(maximumRestoreDurationMs);
    expect(restoredPoints).toHaveLength(checkpointPoints.length);
    expect(checkpointPoints.every((point) => restoredIds.has(point.id))).toBe(true);
    expect(restoredIds.has(postCheckpointPoint.id)).toBe(false);
    expect(restoredPoints.every((point) => point.payload.tenant_id === tenantId)).toBe(true);

    evidence.snapshotRestore = {
      checkpointPoints: checkpointPoints.length,
      restoredPoints: restoredPoints.length,
      restoreDurationMs,
      maximumRestoreDurationMs,
      rpoLostCheckpointWrites: checkpointPoints.length - restoredPoints.length,
      postCheckpointWritesRestored: 0,
      tenantPayloadsValidated: restoredPoints.length,
      passed: true,
    };
    emitReliabilityMeasurement('qdrant-snapshot-restore', evidence.snapshotRestore as Record<string, unknown>);
  });
});
