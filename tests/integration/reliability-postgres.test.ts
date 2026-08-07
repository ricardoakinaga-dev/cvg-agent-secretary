import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {
  assertDisposableContainer,
  boundedPositiveIntegerEnv,
  emitReliabilityMeasurement,
  requiredReliabilityEnv,
  runDocker,
  runReliabilityIntegration,
  writeReliabilityEvidence,
} from './reliability-helpers';
import { runMigrations } from '../../src/modules/migrations/runner';

const describeReliability = runReliabilityIntegration ? describe.sequential : describe.skip;
const adminDatabaseUrl = requiredReliabilityEnv('MIGRATION_DATABASE_URL');
const appDatabaseUrl = requiredReliabilityEnv('DATABASE_URL');
const tenantId = requiredReliabilityEnv('CHATWOOT_ACCOUNT_ID');
const postgresContainer = requiredReliabilityEnv('RELIABILITY_POSTGRES_CONTAINER');
const postgresAdminUser = requiredReliabilityEnv('POSTGRES_ADMIN_USER');
const postgresDatabase = requiredReliabilityEnv('POSTGRES_DB');
const restoreDatabase = `cvg_reliability_restore_${randomUUID().replaceAll('-', '')}`;
const backupPath = '/tmp/cvg-reliability-postgres.dump';
const migrationName = '20991231_reliability_atomic_rollback.sql';
const migrationTable = 'reliability_migration_atomicity';
const postCheckpointTable = 'reliability_post_checkpoint_schema';
const markerName = `reliability-backup-${randomUUID()}`;
const maximumMigrationDurationMs = boundedPositiveIntegerEnv(
  'RELIABILITY_MAX_MIGRATION_DURATION_MS',
  60_000,
  300_000
);
const maximumRestoreDurationMs = boundedPositiveIntegerEnv(
  'RELIABILITY_MAX_RESTORE_DURATION_MS',
  120_000,
  600_000
);

const evidence: Record<string, unknown> = {};
const { Client, Pool } = pg;
const adminPool = new Pool({ connectionString: adminDatabaseUrl });

function assertPostgresIdentifier(value: string, name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${name} contains unsupported characters`);
  }
}

function databaseUrlFor(baseUrl: string, database: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function dockerPostgres(arguments_: string[], timeoutMs = 120_000): Promise<void> {
  await runDocker([
    'exec',
    '--user',
    'postgres',
    postgresContainer,
    ...arguments_,
  ], timeoutMs);
}

async function cleanupSourceArtifacts(): Promise<void> {
  await adminPool.query(`DROP TABLE IF EXISTS ${migrationTable}`);
  await adminPool.query(`DROP TABLE IF EXISTS ${postCheckpointTable}`);
  await adminPool.query('DELETE FROM schema_migrations WHERE name = $1', [migrationName]);
  await adminPool.query('DELETE FROM contacts WHERE name = $1', [markerName]);
}

describeReliability('PostgreSQL migration rollback and full restore', () => {
  beforeAll(async () => {
    await assertDisposableContainer(postgresContainer);
    assertPostgresIdentifier(postgresAdminUser, 'POSTGRES_ADMIN_USER');
    assertPostgresIdentifier(postgresDatabase, 'POSTGRES_DB');
    assertPostgresIdentifier(restoreDatabase, 'restore database');
    if (postgresDatabase === restoreDatabase) {
      throw new Error('PostgreSQL restore target must differ from the source database');
    }
  });

  beforeEach(cleanupSourceArtifacts);

  afterEach(cleanupSourceArtifacts);

  afterAll(async () => {
    await dockerPostgres(['dropdb', '--if-exists', '--username', postgresAdminUser, restoreDatabase])
      .catch(() => undefined);
    await dockerPostgres(['rm', '-f', backupPath]).catch(() => undefined);
    await adminPool.end();
    await writeReliabilityEvidence('postgres.json', {
      suite: 'postgres-migration-rollback-and-full-restore',
      thresholds: {
        maximumMigrationDurationMs,
        maximumRestoreDurationMs,
      },
      evidence,
    });
  });

  it('rolls back a failed migration atomically and serializes concurrent retries', {
    timeout: maximumMigrationDurationMs + 30_000,
  }, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'cvg-reliability-migration-'));
    const migrationPath = path.join(directory, migrationName);
    const firstClient = new Client({ connectionString: adminDatabaseUrl });
    const secondClient = new Client({ connectionString: adminDatabaseUrl });
    const startedAt = performance.now();

    try {
      await writeFile(migrationPath, `
        CREATE TABLE ${migrationTable} (id INTEGER PRIMARY KEY);
        INSERT INTO ${migrationTable} (id) VALUES (1);
        SELECT 1 / 0;
      `, 'utf8');
      await firstClient.connect();
      await expect(runMigrations({
        client: firstClient,
        migrationsDirectory: directory,
        tenantId,
      })).rejects.toThrow();

      const rolledBackTable = await adminPool.query<{ table_name: string | null }>(
        'SELECT to_regclass($1)::text AS table_name',
        [`public.${migrationTable}`]
      );
      const rolledBackLedger = await adminPool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM schema_migrations WHERE name = $1',
        [migrationName]
      );
      expect(rolledBackTable.rows[0].table_name).toBeNull();
      expect(rolledBackLedger.rows[0].count).toBe('0');

      await writeFile(migrationPath, `
        CREATE TABLE ${migrationTable} (id INTEGER PRIMARY KEY);
        INSERT INTO ${migrationTable} (id) VALUES (1);
      `, 'utf8');
      await secondClient.connect();
      const results = await Promise.all([
        runMigrations({ client: firstClient, migrationsDirectory: directory, tenantId }),
        runMigrations({ client: secondClient, migrationsDirectory: directory, tenantId }),
      ]);
      const durationMs = Math.ceil(performance.now() - startedAt);

      expect(results.flatMap((result) => result.applied)).toEqual([migrationName]);
      expect(results.flatMap((result) => result.skipped)).toEqual([migrationName]);
      const committedRows = await adminPool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${migrationTable}`
      );
      expect(committedRows.rows[0].count).toBe('1');
      expect(durationMs).toBeLessThanOrEqual(maximumMigrationDurationMs);

      evidence.migrationRollback = {
        failedMigrationTableWrites: 0,
        failedMigrationLedgerWrites: 0,
        concurrentAttempts: 2,
        appliedExactlyOnce: true,
        durationMs,
        passed: true,
      };
      emitReliabilityMeasurement('postgres-migration-rollback', evidence.migrationRollback as Record<string, unknown>);
    } finally {
      await firstClient.end().catch(() => undefined);
      await secondClient.end().catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('restores a complete database at the checkpoint boundary with RLS intact', {
    timeout: maximumRestoreDurationMs + 60_000,
  }, async () => {
    await adminPool.query(
      'INSERT INTO contacts (tenant_id, name) VALUES ($1, $2)',
      [tenantId, markerName]
    );
    const ledgerAtCheckpoint = await adminPool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM schema_migrations'
    );

    await dockerPostgres(['rm', '-f', backupPath]);
    await dockerPostgres([
      'pg_dump',
      '--format=custom',
      '--no-owner',
      '--username',
      postgresAdminUser,
      '--file',
      backupPath,
      postgresDatabase,
    ], maximumRestoreDurationMs);

    await adminPool.query(`CREATE TABLE ${postCheckpointTable} (id INTEGER PRIMARY KEY)`);
    await adminPool.query(
      'INSERT INTO contacts (tenant_id, name) VALUES ($1, $2)',
      [tenantId, `${markerName}-after-checkpoint`]
    );

    const restoreStartedAt = performance.now();
    await dockerPostgres(['dropdb', '--if-exists', '--username', postgresAdminUser, restoreDatabase]);
    await dockerPostgres(['createdb', '--username', postgresAdminUser, restoreDatabase]);
    await dockerPostgres([
      'pg_restore',
      '--exit-on-error',
      '--no-owner',
      '--username',
      postgresAdminUser,
      '--dbname',
      restoreDatabase,
      backupPath,
    ], maximumRestoreDurationMs);
    const restoreDurationMs = Math.ceil(performance.now() - restoreStartedAt);

    const restoredAdminPool = new Pool({
      connectionString: databaseUrlFor(adminDatabaseUrl, restoreDatabase),
    });
    const restoredAppPool = new Pool({
      connectionString: databaseUrlFor(appDatabaseUrl, restoreDatabase),
      options: `-c app.tenant_id=${tenantId}`,
    });
    try {
      const restoredMarkers = await restoredAdminPool.query<{ name: string }>(
        'SELECT name FROM contacts WHERE name LIKE $1 ORDER BY name',
        [`${markerName}%`]
      );
      const restoredLedger = await restoredAdminPool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM schema_migrations'
      );
      const postCheckpointSchema = await restoredAdminPool.query<{ table_name: string | null }>(
        'SELECT to_regclass($1)::text AS table_name',
        [`public.${postCheckpointTable}`]
      );
      const enabledRlsTables = await restoredAdminPool.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM pg_class table_class
        JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = 'public'
          AND table_class.relkind = 'r'
          AND table_class.relrowsecurity
      `);
      const runtimeVisibleMarkers = await restoredAppPool.query<{ name: string }>(
        'SELECT name FROM contacts WHERE name LIKE $1 ORDER BY name',
        [`${markerName}%`]
      );

      expect(restoredMarkers.rows).toEqual([{ name: markerName }]);
      expect(runtimeVisibleMarkers.rows).toEqual([{ name: markerName }]);
      expect(restoredLedger.rows[0].count).toBe(ledgerAtCheckpoint.rows[0].count);
      expect(postCheckpointSchema.rows[0].table_name).toBeNull();
      expect(Number(enabledRlsTables.rows[0].count)).toBeGreaterThanOrEqual(22);
      expect(restoreDurationMs).toBeLessThanOrEqual(maximumRestoreDurationMs);

      evidence.fullDatabaseRestore = {
        restoreDurationMs,
        maximumRestoreDurationMs,
        checkpointMarkersExpected: 1,
        checkpointMarkersRestored: restoredMarkers.rowCount,
        postCheckpointWritesRestored: 0,
        postCheckpointSchemaRestored: false,
        rpoLostCheckpointWrites: 0,
        migrationLedgerRows: Number(restoredLedger.rows[0].count),
        rlsEnabledTables: Number(enabledRlsTables.rows[0].count),
        runtimeRoleValidated: true,
        passed: true,
      };
      emitReliabilityMeasurement('postgres-full-restore', evidence.fullDatabaseRestore as Record<string, unknown>);
    } finally {
      await restoredAppPool.end();
      await restoredAdminPool.end();
    }
  });
});
