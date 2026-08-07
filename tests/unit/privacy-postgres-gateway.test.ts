import { describe, expect, it, vi } from 'vitest';
import { createPostgresPrivacyGateway } from '../../src/modules/privacy/postgres-gateway';

function client() {
  return {
    query: vi.fn(async (_sql: string, _parameters?: unknown[]) => ({ rows: [], rowCount: 0 })),
    release: vi.fn(),
  };
}

describe('createPostgresPrivacyGateway', () => {
  it('commits and releases successful privacy transactions', async () => {
    const db = client();
    const gateway = createPostgresPrivacyGateway(async () => db);

    await expect(gateway.withTransaction(async (transaction) => {
      await transaction.query('SELECT 1');
      return 'ok';
    })).resolves.toBe('ok');

    expect(db.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'SELECT 1', 'COMMIT']);
    expect(db.release).toHaveBeenCalledOnce();
  });

  it('rolls back, releases and rethrows failed privacy transactions', async () => {
    const db = client();
    const gateway = createPostgresPrivacyGateway(async () => db);

    await expect(gateway.withTransaction(async () => {
      throw new Error('failed');
    })).rejects.toThrow('failed');

    expect(db.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(db.release).toHaveBeenCalledOnce();
  });

  it('releases non-transactional clients', async () => {
    const db = client();
    const gateway = createPostgresPrivacyGateway(async () => db);

    await gateway.withClient(async (connection) => connection.query('SELECT 1'));

    expect(db.release).toHaveBeenCalledOnce();
  });
});
