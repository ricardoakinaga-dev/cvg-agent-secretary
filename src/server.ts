import { app } from './app';
import { config } from './config';
import { logger } from './modules/logging';
import { redisClient } from './shared/redis';

async function startServer(): Promise<void> {
  try {
    logger.info('Starting CVG Secretary Agent', {
      nodeEnv: config.nodeEnv,
      port: config.port,
    });

    // Connect to Redis
    await redisClient.connect();

    // Start Express server
    app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
      logger.info(`Webhook endpoint: http://localhost:${config.port}/webhooks/chatwoot`);
    });
  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  try {
    await redisClient.disconnect();
    logger.info('Redis disconnected');
  } catch (error) {
    logger.error('Error disconnecting Redis', error as Error);
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');

  try {
    await redisClient.disconnect();
    logger.info('Redis disconnected');
  } catch (error) {
    logger.error('Error disconnecting Redis', error as Error);
  }

  process.exit(0);
});

// Start the server
startServer();
