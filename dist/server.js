"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const logging_1 = require("./modules/logging");
const redis_1 = require("./shared/redis");
const contextLoader_1 = require("./modules/conversations/contextLoader");
let handoffCleanupInterval = null;
function startHandoffCleanup() {
    handoffCleanupInterval = setInterval(() => {
        (0, contextLoader_1.sweepExpiredHandoffs)().catch((error) => {
            logging_1.logger.error('Expired handoff cleanup failed', error);
        });
    }, 60_000);
    handoffCleanupInterval.unref();
}
async function startServer() {
    try {
        logging_1.logger.info('Starting CVG Secretary Agent', {
            nodeEnv: config_1.config.nodeEnv,
            port: config_1.config.port,
        });
        // Connect to Redis
        await redis_1.redisClient.connect();
        startHandoffCleanup();
        // Start Express server
        app_1.app.listen(config_1.config.port, () => {
            logging_1.logger.info(`Server listening on port ${config_1.config.port}`);
            logging_1.logger.info(`Health check: http://localhost:${config_1.config.port}/health`);
            logging_1.logger.info(`Webhook endpoint: http://localhost:${config_1.config.port}/webhooks/chatwoot`);
        });
    }
    catch (error) {
        logging_1.logger.error('Failed to start server', error);
        process.exit(1);
    }
}
// Handle graceful shutdown
process.on('SIGTERM', async () => {
    logging_1.logger.info('SIGTERM received, shutting down gracefully');
    try {
        if (handoffCleanupInterval) {
            clearInterval(handoffCleanupInterval);
        }
        await redis_1.redisClient.disconnect();
        logging_1.logger.info('Redis disconnected');
    }
    catch (error) {
        logging_1.logger.error('Error disconnecting Redis', error);
    }
    process.exit(0);
});
process.on('SIGINT', async () => {
    logging_1.logger.info('SIGINT received, shutting down gracefully');
    try {
        if (handoffCleanupInterval) {
            clearInterval(handoffCleanupInterval);
        }
        await redis_1.redisClient.disconnect();
        logging_1.logger.info('Redis disconnected');
    }
    catch (error) {
        logging_1.logger.error('Error disconnecting Redis', error);
    }
    process.exit(0);
});
// Start the server
startServer();
//# sourceMappingURL=server.js.map