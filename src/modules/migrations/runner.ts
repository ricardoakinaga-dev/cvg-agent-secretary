import { createHash } from 'node:crypto';
import { readFile as readFileFromDisk, readdir } from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_LOCK_NAME = 'cvg-agent-secretary:migrations';

interface QueryResultLike {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
}

export interface MigrationClient {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>;
}

export interface MigrationRunnerOptions {
  client: MigrationClient;
  migrationsDirectory: string;
  tenantId: string;
  listFiles?: (directory: string) => Promise<string[]>;
  readFile?: (filename: string) => Promise<string>;
}

export interface MigrationRunResult {
  applied: string[];
  skipped: string[];
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

function stripOuterTransaction(sql: string): string {
  return sql
    .trim()
    .replace(/^BEGIN\s*;\s*/i, '')
    .replace(/\s*COMMIT\s*;\s*$/i, '')
    .trim();
}

async function defaultListFiles(directory: string): Promise<string[]> {
  return readdir(directory);
}

async function defaultReadFile(filename: string): Promise<string> {
  return readFileFromDisk(filename, 'utf8');
}

export async function runMigrations(options: MigrationRunnerOptions): Promise<MigrationRunResult> {
  if (!/^\d+$/.test(options.tenantId) || Number(options.tenantId) < 1) {
    throw new Error('A positive tenantId is required to run migrations');
  }

  const listFiles = options.listFiles ?? defaultListFiles;
  const readFile = options.readFile ?? defaultReadFile;
  const result: MigrationRunResult = { applied: [], skipped: [] };

  await options.client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_NAME]);
  try {
    await options.client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const filenames = (await listFiles(options.migrationsDirectory))
      .filter((filename) => /^\d{8}_[a-z0-9_]+\.sql$/i.test(filename))
      .sort();

    for (const filename of filenames) {
      const fullPath = path.join(options.migrationsDirectory, filename);
      const originalSql = await readFile(fullPath);
      const migrationChecksum = checksum(originalSql);
      const existing = await options.client.query(
        'SELECT checksum FROM schema_migrations WHERE name = $1',
        [filename]
      );

      if (existing.rows.length > 0) {
        if (existing.rows[0].checksum !== migrationChecksum) {
          throw new Error(`Checksum mismatch for applied migration ${filename}`);
        }
        result.skipped.push(filename);
        continue;
      }

      await options.client.query('BEGIN');
      try {
        await options.client.query(
          "SELECT set_config('app.migration_tenant_id', $1, true)",
          [options.tenantId]
        );
        const migrationSql = stripOuterTransaction(originalSql);
        if (migrationSql) {
          await options.client.query(migrationSql);
        }
        await options.client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [filename, migrationChecksum]
        );
        await options.client.query('COMMIT');
        result.applied.push(filename);
      } catch (error) {
        await options.client.query('ROLLBACK');
        throw error;
      }
    }

    return result;
  } finally {
    await options.client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_NAME]);
  }
}
