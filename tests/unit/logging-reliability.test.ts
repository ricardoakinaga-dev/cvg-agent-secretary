const pinoMock = vi.hoisted(() => {
  const childBackend = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const rootBackend = {
    ...childBackend,
    child: vi.fn(() => childBackend),
  };

  return {
    factory: vi.fn(() => rootBackend),
    rootBackend,
    childBackend,
  };
});

vi.mock('pino', () => ({ default: pinoMock.factory }));

describe('logging reliability', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('uses the native child logger without creating another pino transport', async () => {
    process.env.NODE_ENV = 'development';
    const { logger } = await import('../../src/modules/logging');

    const child = logger.child({ correlationId: 'correlation-1' });
    child.info('child message');

    expect(pinoMock.factory).toHaveBeenCalledOnce();
    expect(pinoMock.rootBackend.child).toHaveBeenCalledWith({ correlationId: 'correlation-1' });
    expect(pinoMock.childBackend.info).toHaveBeenCalledOnce();
  });

  it('emits structured logs without pino-pretty in production', async () => {
    process.env.NODE_ENV = 'production';
    await import('../../src/modules/logging');

    expect(pinoMock.factory).toHaveBeenCalledWith(
      expect.not.objectContaining({ transport: expect.anything() })
    );
  });
});
