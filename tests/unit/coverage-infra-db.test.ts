import pg from 'pg';
import {
  checkDatabaseConnection,
  closeDbPool,
  getClient,
  getDbPool,
  query,
} from '../../src/shared/db';

describe('infrastructure coverage: database pool', () => {
  let queryMock: ReturnType<typeof vi.spyOn>;
  let connectMock: ReturnType<typeof vi.spyOn>;
  let endMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryMock = vi.spyOn(pg.Pool.prototype, 'query');
    connectMock = vi.spyOn(pg.Pool.prototype, 'connect');
    endMock = vi.spyOn(pg.Pool.prototype, 'end').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await closeDbPool();
    vi.restoreAllMocks();
  });

  it('initializes one tenant-scoped pool and exposes pooled clients', async () => {
    const pool = getDbPool();
    const pooledClient = { release: vi.fn() };
    connectMock.mockResolvedValue(pooledClient as never);

    expect(getDbPool()).toBe(pool);
    expect((pool as unknown as { options: Record<string, unknown> }).options).toEqual(expect.objectContaining({
      connectionString: 'postgresql://test:test@localhost:5432/test',
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      options: '-c app.tenant_id=1',
    }));
    await expect(getClient()).resolves.toBe(pooledClient);

    expect(() => pool.emit('error', new Error('idle client error'), {} as never)).not.toThrow();
  });

  it('returns query results and propagates database errors', async () => {
    getDbPool();
    const success = { rows: [{ id: 1 }], rowCount: 1 };
    queryMock.mockResolvedValueOnce(success as never);

    await expect(query<{ id: number }>('SELECT id FROM things WHERE id = $1', [1]))
      .resolves.toBe(success);
    expect(queryMock).toHaveBeenCalledWith('SELECT id FROM things WHERE id = $1', [1]);

    const failure = new Error('database unavailable');
    queryMock.mockRejectedValueOnce(failure);
    await expect(query('SELECT secret FROM unavailable')).rejects.toBe(failure);
  });

  it('requires every production table in the readiness check', async () => {
    getDbPool();
    queryMock
      .mockResolvedValueOnce({ rows: [{ check: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ check: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(checkDatabaseConnection()).resolves.toBe(true);
    await expect(checkDatabaseConnection()).resolves.toBe(false);
    await expect(checkDatabaseConnection()).resolves.toBe(false);
    expect(queryMock.mock.calls[0][0]).toMatch(/knowledge_documents/);
    expect(queryMock.mock.calls[0][0]).toMatch(/appointment_slots/);
  });

  it('fails readiness closed on query errors and closes only initialized pools', async () => {
    getDbPool();
    queryMock.mockRejectedValueOnce(new Error('connection refused'));

    await expect(checkDatabaseConnection()).resolves.toBe(false);
    await closeDbPool();
    await closeDbPool();
    expect(endMock).toHaveBeenCalledOnce();
  });
});
