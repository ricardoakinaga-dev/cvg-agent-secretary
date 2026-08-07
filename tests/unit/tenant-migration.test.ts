import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve('database/migrations/20260802_add_tenant_isolation.sql');
const schemaPath = resolve('database/schema.sql');
const handoffSchemaPath = resolve('database/handoff_schema.sql');

describe('tenant isolation database definitions', () => {
  it('requires an explicit tenant setting for an expand/backfill migration', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain("PGOPTIONS='-c app.migration_tenant_id=123' psql \"$DATABASE_URL\" --single-transaction --file=database/migrations/20260802_add_tenant_isolation.sql");
    expect(migration).toContain("current_setting('app.migration_tenant_id', true)");
    expect(migration).not.toContain(":'tenant_id'");
    expect(migration).toMatch(/ADD COLUMN (?:IF NOT EXISTS )?tenant_id BIGINT/);
    expect(migration).toMatch(/SET tenant_id = current_setting\('app\.migration_tenant_id', true\)::BIGINT/);
    expect(migration).toMatch(/ALTER COLUMN tenant_id SET NOT NULL/);
  });

  it('bootstraps tables that were optional in legacy installations before altering them', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const createOffset = migration.indexOf('CREATE TABLE IF NOT EXISTS sector_notifications');
    const alterOffset = migration.indexOf('ALTER TABLE sector_notifications ADD COLUMN');

    expect(createOffset).toBeGreaterThan(-1);
    expect(alterOffset).toBeGreaterThan(createOffset);
  });

  it('replaces global Chatwoot uniqueness and enables tenant RLS', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('UNIQUE (tenant_id, chatwoot_conversation_id)');
    expect(migration).toMatch(/contacts\s*\(tenant_id, chatwoot_id\)/);
    expect(migration).not.toMatch(/CREATE UNIQUE INDEX[^;]+ON contacts\s*\(chatwoot_id\)/s);
    for (const table of ['conversations', 'messages', 'contacts', 'pets', 'customer_memories']) {
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain("current_setting('app.tenant_id', true)");
  });

  it('defines new core records with tenant columns and composite uniqueness', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    for (const table of ['conversations', 'messages', 'contacts', 'pets', 'customer_memories']) {
      expect(schema).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?tenant_id BIGINT NOT NULL`));
    }
    expect(schema).toContain('UNIQUE (tenant_id, chatwoot_conversation_id)');
    expect(schema).toMatch(/contacts\(tenant_id, chatwoot_id\)/);
  });

  it('tenant-scopes every persisted table, including feedback and scheduling', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const migration = readFileSync(migrationPath, 'utf8');
    const tables = [
      'audit_logs',
      'conversation_summaries',
      'tool_executions',
      'handoffs',
      'sector_notifications',
      'appointment_services',
      'appointment_providers',
      'appointment_slots',
      'appointments',
      'followup_tasks',
      'knowledge_documents',
      'knowledge_chunks',
      'telegram_ingestions',
      'operational_rules',
      'analytics_events',
      'audit_events',
      'response_feedback',
    ];

    for (const table of tables) {
      expect(schema).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?tenant_id BIGINT NOT NULL`));
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`CREATE POLICY tenant_isolation ON ${table}`);
    }
  });

  it('keeps the standalone handoff schema tenant-aware', () => {
    const handoffSchema = readFileSync(handoffSchemaPath, 'utf8');

    for (const table of ['handoffs', 'operational_rules', 'sector_notifications']) {
      expect(handoffSchema).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?tenant_id BIGINT NOT NULL`));
      expect(handoffSchema).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(handoffSchema).toContain(`CREATE POLICY tenant_isolation ON ${table}`);
    }
    expect(handoffSchema).toContain("current_setting('app.migration_tenant_id', true)::BIGINT");
  });
});
