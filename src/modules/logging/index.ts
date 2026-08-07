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

  constructor(parentLogger?: pino.Logger) {
    if (parentLogger) {
      this.logger = parentLogger;
      return;
    }

    const options: pino.LoggerOptions = {
      level: config.logging.level,
    };

    if (!config.isProduction) {
      options.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      };
    }

    this.logger = pino(options);
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

  error(message: string, error?: unknown, context?: LogContext): void {
    const normalizedError = error instanceof Error
      ? error
      : error === undefined ? undefined : new Error(String(error));
    const errorContext = normalizedError
      ? {
          error: {
            message: maskSensitiveData(normalizedError.message),
            name: normalizedError.name,
          },
          ...context,
        }
      : context;

    this.logger.error(this.buildContext(errorContext), message);
  }

  child(bindings: LogContext): Logger {
    const safeBindings = maskObjectForLog(bindings);
    return new Logger(this.logger.child(safeBindings));
  }
}

export const logger = new Logger();
