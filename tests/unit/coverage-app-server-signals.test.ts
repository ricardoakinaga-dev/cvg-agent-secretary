import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

interface SignalHarness {
  handlers: Partial<Record<'SIGTERM' | 'SIGINT', () => void>>;
  exit: ReturnType<typeof vi.fn>;
  logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  closeServer: ReturnType<typeof vi.fn>;
  stopWorker: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  closeDb: ReturnType<typeof vi.fn>;
}

function executeServerAsMain(options: { valid?: boolean; closeError?: Error } = {}): SignalHarness {
  const source = readFileSync(path.join(process.cwd(), 'src/server.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: 'server.ts',
  }).outputText;

  const handlers: SignalHarness['handlers'] = {};
  const exit = vi.fn();
  const logger = { info: vi.fn(), error: vi.fn() };
  const closeServer = vi.fn((callback: (error?: Error) => void) => callback(options.closeError));
  const stopWorker = vi.fn(async () => undefined);
  const disconnect = vi.fn(async () => undefined);
  const closeDb = vi.fn(async () => undefined);
  const server = { close: closeServer };
  const moduleRecord = { exports: {} as Record<string, unknown> };

  const dependencies: Record<string, unknown> = {
    './app': {
      app: {
        listen: vi.fn((_port: number, callback: () => void) => {
          callback();
          return server;
        }),
      },
    },
    './config': {
      config: { nodeEnv: 'test', port: 3000 },
      validateConfig: vi.fn(() => options.valid === false
        ? { valid: false, errors: ['invalid test configuration'] }
        : { valid: true, errors: [] }),
    },
    './modules/logging': { logger },
    './shared/redis': {
      redisClient: {
        connect: vi.fn(async () => undefined),
        disconnect,
      },
    },
    './modules/conversations/contextLoader': {
      sweepExpiredHandoffs: vi.fn(async () => undefined),
    },
    './modules/webhook/worker': {
      chatwootWebhookWorker: {
        start: vi.fn(async () => undefined),
        stop: stopWorker,
      },
    },
    './modules/contacts/pii': {
      assertContactPiiReady: vi.fn(async () => undefined),
    },
    './shared/db': { closeDbPool: closeDb },
  };

  const localRequire = Object.assign(
    (specifier: string) => {
      if (!(specifier in dependencies)) throw new Error(`Unexpected require: ${specifier}`);
      return dependencies[specifier];
    },
    { main: moduleRecord }
  );
  const intervalHandle = { unref: vi.fn() };

  vm.runInNewContext(compiled, {
    module: moduleRecord,
    exports: moduleRecord.exports,
    require: localRequire,
    process: {
      on: vi.fn((signal: 'SIGTERM' | 'SIGINT', handler: () => void) => {
        handlers[signal] = handler;
      }),
      exit,
    },
    setInterval: vi.fn(() => intervalHandle),
    clearInterval: vi.fn(),
    Promise,
    Error,
    AggregateError,
  }, { filename: 'src/server.ts' });

  return { handlers, exit, logger, closeServer, stopWorker, disconnect, closeDb };
}

describe('server process signal behavior', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)('registers %s and performs a graceful shutdown', async (signal) => {
    const harness = executeServerAsMain();
    await vi.waitFor(() => expect(harness.handlers[signal]).toBeTypeOf('function'));
    await vi.waitFor(() => {
      expect(harness.logger.info).toHaveBeenCalledWith('Server listening on port 3000');
    });

    harness.handlers[signal]?.();

    await vi.waitFor(() => expect(harness.exit).toHaveBeenCalledWith(0));
    expect(harness.logger.info).toHaveBeenCalledWith(`${signal} received, shutting down gracefully`);
    expect(harness.logger.info).toHaveBeenCalledWith('Server shutdown completed');
    expect(harness.closeServer).toHaveBeenCalledOnce();
    expect(harness.stopWorker).toHaveBeenCalledOnce();
    expect(harness.disconnect).toHaveBeenCalledOnce();
    expect(harness.closeDb).toHaveBeenCalledOnce();
  });

  it('logs shutdown failures but still exits cleanly after a signal', async () => {
    const harness = executeServerAsMain({ closeError: new Error('close failed') });
    await vi.waitFor(() => expect(harness.handlers.SIGTERM).toBeTypeOf('function'));
    await vi.waitFor(() => {
      expect(harness.logger.info).toHaveBeenCalledWith('Server listening on port 3000');
    });

    harness.handlers.SIGTERM?.();

    await vi.waitFor(() => expect(harness.exit).toHaveBeenCalledWith(0));
    expect(harness.logger.error).toHaveBeenCalledWith(
      'Error during graceful shutdown',
      expect.objectContaining({ message: 'close failed' })
    );
  });

  it('logs fatal startup validation and exits with failure', async () => {
    const harness = executeServerAsMain({ valid: false });

    await vi.waitFor(() => expect(harness.exit).toHaveBeenCalledWith(1));
    expect(harness.logger.error).toHaveBeenCalledWith(
      'Failed to start server',
      expect.objectContaining({ message: expect.stringContaining('invalid test configuration') })
    );
  });
});
