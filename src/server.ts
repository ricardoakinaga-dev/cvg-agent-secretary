import { app } from './app';
import { config, validateConfig } from './config';
import { logger } from './modules/logging';
import { redisClient } from './shared/redis';
import { sweepExpiredHandoffs } from './modules/conversations/contextLoader';
import { chatwootWebhookWorker } from './modules/webhook/worker';
import { closeDbPool } from './shared/db';
import { assertContactPiiReady } from './modules/contacts/pii';
import type { Server } from 'http';

let handoffCleanupInterval: NodeJS.Timeout | null = null;
let httpServer: Server | null = null;

export interface StartServerDependencies {
  validateConfig: typeof validateConfig;
  assertPiiReady: () => Promise<void>;
  connectRedis: () => Promise<void>;
  startWebhookWorker: () => Promise<void>;
  startHandoffCleanup: () => void;
  listen: (port: number) => Server;
}

export interface StopServerDependencies {
  closeHttpServer: (server: Server | null) => Promise<void>;
  stopWebhookWorker: () => Promise<void>;
  disconnectRedis: () => Promise<void>;
  closeDbPool: () => Promise<void>;
}

function closeHttpServer(server: Server | null): Promise<void> {
  if (!server) return Promise.resolve();

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function startHandoffCleanup(): void {
  handoffCleanupInterval = setInterval(() => {
    sweepExpiredHandoffs().catch((error) => {
      logger.error('Expired handoff cleanup failed', error as Error);
    });
  }, 60_000);

  handoffCleanupInterval.unref();
}

const defaultStartServerDependencies: StartServerDependencies = {
  validateConfig,
  assertPiiReady: assertContactPiiReady,
  connectRedis: () => redisClient.connect(),
  startWebhookWorker: () => chatwootWebhookWorker.start(),
  startHandoffCleanup,
  listen: (port) => app.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
    logger.info(`Health check: http://localhost:${port}/health`);
    logger.info(`Webhook endpoint: http://localhost:${port}/webhooks/chatwoot`);
  }),
};

const defaultStopServerDependencies: StopServerDependencies = {
  closeHttpServer,
  stopWebhookWorker: () => chatwootWebhookWorker.stop(),
  disconnectRedis: () => redisClient.disconnect(),
  closeDbPool,
};

export async function startServer(
  dependencies: StartServerDependencies = defaultStartServerDependencies
): Promise<void> {
  const validation = dependencies.validateConfig();
  if (!validation.valid) {
    throw new Error(`Invalid server configuration: ${validation.errors.join('; ')}`);
  }

  logger.info('Starting CVG Secretary Agent', {
    nodeEnv: config.nodeEnv,
    port: config.port,
  });

  await dependencies.assertPiiReady();
  await dependencies.connectRedis();
  await dependencies.startWebhookWorker();
  dependencies.startHandoffCleanup();
  httpServer = dependencies.listen(config.port);
}

export async function stopServer(
  dependencies: StopServerDependencies = defaultStopServerDependencies
): Promise<void> {
  if (handoffCleanupInterval) {
    clearInterval(handoffCleanupInterval);
    handoffCleanupInterval = null;
  }

  const serverToClose = httpServer;
  httpServer = null;
  const errors: unknown[] = [];

  const close = async (operation: () => Promise<void>): Promise<void> => {
    try {
      await operation();
    } catch (error) {
      errors.push(error);
    }
  };

  await close(() => dependencies.closeHttpServer(serverToClose));
  await close(dependencies.stopWebhookWorker);
  await close(dependencies.disconnectRedis);
  await close(dependencies.closeDbPool);

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Multiple errors occurred during shutdown');
}

async function shutdown(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
  logger.info(`${signal} received, shutting down gracefully`);

  try {
    await stopServer();
    logger.info('Server shutdown completed');
  } catch (error) {
    logger.error('Error during graceful shutdown', error as Error);
  }

  process.exit(0);
}

function registerShutdownHandlers(): void {
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

if (require.main === module) {
  registerShutdownHandlers();

  void startServer().catch((error) => {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  });
}
