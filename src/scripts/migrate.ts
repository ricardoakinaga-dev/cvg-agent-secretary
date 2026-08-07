import pg from 'pg';
import path from 'node:path';
import { runMigrations } from '../modules/migrations/runner';

const { Client } = pg;

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for migrations`);
  }
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL
    || requiredEnvironmentValue('DATABASE_URL');
  const tenantId = requiredEnvironmentValue('CHATWOOT_ACCOUNT_ID');
  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });

  await client.connect();
  try {
    const result = await runMigrations({
      client,
      tenantId,
      migrationsDirectory: path.resolve(process.cwd(), 'database/migrations'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
