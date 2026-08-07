import type { Server } from 'http';

const lifecycleMocks = vi.hoisted(() => {
  const server = {} as Server;
  const close = vi.fn((callback?: (error?: Error) => void) => {
    callback?.();
    return server;
  });
  server.close = close;
  return {
    server,
    listen: vi.fn(),
    validateConfig: vi.fn(() => ({ valid: true, errors: [] as string[] })),
    assertPiiReady: vi.fn(async () => undefined),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    startWorker: vi.fn(async () => undefined),
    stopWorker: vi.fn(async () => undefined),
    sweep: vi.fn(async () => undefined),
    closeDbPool: vi.fn(async () => undefined),
    loggerInfo: vi.fn(),
    loggerError: vi.fn(),
  };
});

vi.mock('../../src/app', () => ({
  app: {
    listen: lifecycleMocks.listen,
  },
}));
vi.mock('../../src/config', () => ({
  config: { nodeEnv: 'test', port: 3456 },
  validateConfig: lifecycleMocks.validateConfig,
}));
vi.mock('../../src/modules/logging', () => ({
  logger: {
    info: lifecycleMocks.loggerInfo,
    error: lifecycleMocks.loggerError,
  },
}));
vi.mock('../../src/shared/redis', () => ({
  redisClient: {
    connect: lifecycleMocks.connect,
    disconnect: lifecycleMocks.disconnect,
  },
}));
vi.mock('../../src/modules/conversations/contextLoader', () => ({
  sweepExpiredHandoffs: lifecycleMocks.sweep,
}));
vi.mock('../../src/modules/webhook/worker', () => ({
  chatwootWebhookWorker: {
    start: lifecycleMocks.startWorker,
    stop: lifecycleMocks.stopWorker,
  },
}));
vi.mock('../../src/modules/contacts/pii', () => ({
  assertContactPiiReady: lifecycleMocks.assertPiiReady,
}));
vi.mock('../../src/shared/db', () => ({
  closeDbPool: lifecycleMocks.closeDbPool,
}));

import {
  startServer,
  stopServer,
  StartServerDependencies,
  StopServerDependencies,
} from '../../src/server';

function startDependencies(overrides: Partial<StartServerDependencies> = {}): StartServerDependencies {
  return {
    validateConfig: vi.fn(() => ({ valid: true, errors: [] })),
    assertPiiReady: vi.fn(async () => undefined),
    connectRedis: vi.fn(async () => undefined),
    startWebhookWorker: vi.fn(async () => undefined),
    startHandoffCleanup: vi.fn(),
    listen: vi.fn(() => lifecycleMocks.server),
    ...overrides,
  };
}

function stopDependencies(overrides: Partial<StopServerDependencies> = {}): StopServerDependencies {
  return {
    closeHttpServer: vi.fn(async () => undefined),
    stopWebhookWorker: vi.fn(async () => undefined),
    disconnectRedis: vi.fn(async () => undefined),
    closeDbPool: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('server lifecycle edge coverage', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    lifecycleMocks.listen.mockImplementation((_port: number, callback: () => void) => {
      callback();
      return lifecycleMocks.server;
    });
    lifecycleMocks.validateConfig.mockReturnValue({ valid: true, errors: [] });
    lifecycleMocks.server.close = vi.fn((callback?: (error?: Error) => void) => {
      callback?.();
      return lifecycleMocks.server;
    });
    lifecycleMocks.connect.mockResolvedValue(undefined);
    lifecycleMocks.disconnect.mockResolvedValue(undefined);
    lifecycleMocks.startWorker.mockResolvedValue(undefined);
    lifecycleMocks.stopWorker.mockResolvedValue(undefined);
    lifecycleMocks.sweep.mockResolvedValue(undefined);
    lifecycleMocks.closeDbPool.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await stopServer(stopDependencies()).catch(() => undefined);
  });

  it('lets a default shutdown run safely before any server has started', async () => {
    await expect(stopServer()).resolves.toBeUndefined();
    expect(lifecycleMocks.stopWorker).toHaveBeenCalledOnce();
    expect(lifecycleMocks.disconnect).toHaveBeenCalledOnce();
    expect(lifecycleMocks.closeDbPool).toHaveBeenCalledOnce();
  });

  it('starts and stops all default resources and logs the listening endpoints', async () => {
    await startServer();

    expect(lifecycleMocks.validateConfig).toHaveBeenCalledOnce();
    expect(lifecycleMocks.connect).toHaveBeenCalledOnce();
    expect(lifecycleMocks.startWorker).toHaveBeenCalledOnce();
    expect(lifecycleMocks.listen).toHaveBeenCalledWith(3456, expect.any(Function));
    expect(lifecycleMocks.loggerInfo).toHaveBeenCalledWith('Server listening on port 3456');
    expect(lifecycleMocks.loggerInfo).toHaveBeenCalledWith('Health check: http://localhost:3456/health');
    expect(lifecycleMocks.loggerInfo).toHaveBeenCalledWith(
      'Webhook endpoint: http://localhost:3456/webhooks/chatwoot'
    );

    await stopServer();

    expect(lifecycleMocks.server.close).toHaveBeenCalledOnce();
    expect(lifecycleMocks.stopWorker).toHaveBeenCalledOnce();
    expect(lifecycleMocks.disconnect).toHaveBeenCalledOnce();
    expect(lifecycleMocks.closeDbPool).toHaveBeenCalledOnce();
  });

  it('runs the periodic handoff cleanup and logs rejected sweeps', async () => {
    vi.useFakeTimers();
    lifecycleMocks.sweep.mockRejectedValue(new Error('cleanup failed'));

    await startServer();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(lifecycleMocks.sweep).toHaveBeenCalledOnce();
    expect(lifecycleMocks.loggerError).toHaveBeenCalledWith(
      'Expired handoff cleanup failed',
      expect.objectContaining({ message: 'cleanup failed' })
    );

    await stopServer();
    vi.useRealTimers();
  });

  it('rejects when the HTTP server close callback reports an error', async () => {
    lifecycleMocks.server.close = vi.fn((callback?: (error?: Error) => void) => {
      callback?.(new Error('http close failed'));
      return lifecycleMocks.server;
    });
    await startServer();

    await expect(stopServer()).rejects.toThrow('http close failed');
    expect(lifecycleMocks.stopWorker).toHaveBeenCalledOnce();
    expect(lifecycleMocks.disconnect).toHaveBeenCalledOnce();
    expect(lifecycleMocks.closeDbPool).toHaveBeenCalledOnce();
  });

  it('does not initialize later components when Redis startup fails', async () => {
    const dependencies = startDependencies({
      connectRedis: vi.fn(async () => {
        throw new Error('redis connect failed');
      }),
    });

    await expect(startServer(dependencies)).rejects.toThrow('redis connect failed');
    expect(dependencies.startWebhookWorker).not.toHaveBeenCalled();
    expect(dependencies.startHandoffCleanup).not.toHaveBeenCalled();
    expect(dependencies.listen).not.toHaveBeenCalled();
  });

  it('does not start cleanup or listen when worker startup fails', async () => {
    const dependencies = startDependencies({
      startWebhookWorker: vi.fn(async () => {
        throw new Error('worker start failed');
      }),
    });

    await expect(startServer(dependencies)).rejects.toThrow('worker start failed');
    expect(dependencies.connectRedis).toHaveBeenCalledOnce();
    expect(dependencies.startHandoffCleanup).not.toHaveBeenCalled();
    expect(dependencies.listen).not.toHaveBeenCalled();
  });

  it('aggregates multiple shutdown errors after every close is attempted', async () => {
    const dependencies = stopDependencies({
      closeHttpServer: vi.fn(async () => { throw new Error('http failed'); }),
      stopWebhookWorker: vi.fn(async () => { throw new Error('worker failed'); }),
      disconnectRedis: vi.fn(async () => { throw new Error('redis failed'); }),
      closeDbPool: vi.fn(async () => { throw new Error('database failed'); }),
    });

    await expect(stopServer(dependencies)).rejects.toMatchObject({
      name: 'AggregateError',
      message: 'Multiple errors occurred during shutdown',
      errors: [
        expect.objectContaining({ message: 'http failed' }),
        expect.objectContaining({ message: 'worker failed' }),
        expect.objectContaining({ message: 'redis failed' }),
        expect.objectContaining({ message: 'database failed' }),
      ],
    });
    expect(dependencies.closeHttpServer).toHaveBeenCalledOnce();
    expect(dependencies.stopWebhookWorker).toHaveBeenCalledOnce();
    expect(dependencies.disconnectRedis).toHaveBeenCalledOnce();
    expect(dependencies.closeDbPool).toHaveBeenCalledOnce();
  });
});
