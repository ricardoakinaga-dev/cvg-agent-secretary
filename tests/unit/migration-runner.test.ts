import { createHash } from 'node:crypto';
import { runMigrations } from '../../src/modules/migrations/runner';

function createClient(existingRows: Array<{ name: string; checksum: string }> = []) {
  const applied = new Map(existingRows.map((row) => [row.name, row.checksum]));
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('SELECT checksum FROM schema_migrations')) {
      const checksum = applied.get(String(params?.[0]));
      return { rows: checksum ? [{ checksum }] : [], rowCount: checksum ? 1 : 0 };
    }
    if (sql.includes('INSERT INTO schema_migrations')) {
      applied.set(String(params?.[0]), String(params?.[1]));
    }
    return { rows: [], rowCount: 0 };
  });

  return { query, release: vi.fn(), applied };
}

describe('migration runner', () => {
  it('applies pending SQL in one transaction and records its checksum', async () => {
    const client = createClient();
    const sql = 'BEGIN;\nCREATE TABLE example (id INTEGER);\nCOMMIT;';

    const result = await runMigrations({
      client,
      migrationsDirectory: '/migrations',
      tenantId: '1',
      listFiles: vi.fn().mockResolvedValue([
        '20260802_second.sql',
        '20260801_first.sql',
        'notes.txt',
      ]),
      readFile: vi.fn()
        .mockResolvedValueOnce(sql)
        .mockResolvedValueOnce('CREATE INDEX example_idx ON example(id);'),
    });

    expect(result).toEqual({
      applied: ['20260801_first.sql', '20260802_second.sql'],
      skipped: [],
    });
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(
      "SELECT set_config('app.migration_tenant_id', $1, true)",
      ['1']
    );
    expect(client.query).toHaveBeenCalledWith('CREATE TABLE example (id INTEGER);');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO schema_migrations'),
      ['20260801_first.sql', createHash('sha256').update(sql).digest('hex')]
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('skips an already applied migration with the same checksum', async () => {
    const sql = 'SELECT 1;';
    const checksum = createHash('sha256').update(sql).digest('hex');
    const client = createClient([{ name: '20260801_done.sql', checksum }]);

    const result = await runMigrations({
      client,
      migrationsDirectory: '/migrations',
      tenantId: '1',
      listFiles: vi.fn().mockResolvedValue(['20260801_done.sql']),
      readFile: vi.fn().mockResolvedValue(sql),
    });

    expect(result).toEqual({ applied: [], skipped: ['20260801_done.sql'] });
    expect(client.query).not.toHaveBeenCalledWith('BEGIN');
  });

  it('fails closed when an applied migration checksum changes', async () => {
    const client = createClient([{ name: '20260801_changed.sql', checksum: 'old-checksum' }]);

    await expect(runMigrations({
      client,
      migrationsDirectory: '/migrations',
      tenantId: '1',
      listFiles: vi.fn().mockResolvedValue(['20260801_changed.sql']),
      readFile: vi.fn().mockResolvedValue('SELECT 2;'),
    })).rejects.toThrow('Checksum mismatch for applied migration 20260801_changed.sql');

    expect(client.query).not.toHaveBeenCalledWith('BEGIN');
  });

  it('rolls back a failed migration and always releases the advisory lock', async () => {
    const client = createClient();
    client.query.mockImplementation(async (sql: string) => {
      if (sql === 'INVALID SQL;') throw new Error('syntax error');
      if (sql.includes('SELECT checksum FROM schema_migrations')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    await expect(runMigrations({
      client,
      migrationsDirectory: '/migrations',
      tenantId: '1',
      listFiles: vi.fn().mockResolvedValue(['20260801_bad.sql']),
      readFile: vi.fn().mockResolvedValue('INVALID SQL;'),
    })).rejects.toThrow('syntax error');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1))',
      ['cvg-agent-secretary:migrations']
    );
  });
});
