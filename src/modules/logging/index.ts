import pino from 'pino';
import { config } from '../../config';
import { maskSensitiveData, maskObjectForLog } from '../../shared/data-masking';

export interface LogContext {
  correlationId?: string;
  conversationId?: string;
  contactId?: string;
  messageId?: string;
  [key: string]: unknown;
}

class Logger {
  private logger: pino.Logger;

  constructor() {
    this.logger = pino({
      level: config.logging.level,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  private buildContext(context?: LogContext): Record<string, unknown> {
    const base = {
      timestamp: new Date().toISOString(),
      ...context,
    };
    // Mask sensitive data in logs
    return maskObjectForLog(base as Record<string, unknown>);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.buildContext(context), message);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(this.buildContext(context), message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.buildContext(context), message);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext = error
      ? {
          error: {
            message: maskSensitiveData(error.message),
            stack: error.stack,
            name: error.name,
          },
          ...context,
        }
      : context;

    this.logger.error(this.buildContext(errorContext), message);
  }

  child(bindings: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }
}

export const logger = new Logger();
