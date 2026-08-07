import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('conversation persistence migration', () => {
  it('adds an idempotent per-conversation Chatwoot message constraint', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'database/migrations/20260710_add_conversation_message_persistence.sql'),
      'utf8'
    );
    const tenantMigration = readFileSync(
      resolve(process.cwd(), 'database/migrations/20260802_add_tenant_isolation.sql'),
      'utf8'
    );

    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(migration).toContain('messages(conversation_id, chatwoot_message_id)');
    expect(tenantMigration).toContain('messages(tenant_id, conversation_id, chatwoot_message_id)');
  });

  it('runs migrations through the checksummed application runner', () => {
    const compose = readFileSync(resolve(process.cwd(), 'docker-compose.yml'), 'utf8');
    const packageJson = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');

    expect(compose).toContain('dist/scripts/migrate.js');
    expect(compose).toContain('MIGRATION_DATABASE_URL');
    expect(packageJson).toContain('node dist/scripts/migrate.js');
  });
});
