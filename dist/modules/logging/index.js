"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../../config");
const data_masking_1 = require("../../shared/data-masking");
class Logger {
    logger;
    constructor() {
        this.logger = (0, pino_1.default)({
            level: config_1.config.logging.level,
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
    buildContext(context) {
        const base = {
            timestamp: new Date().toISOString(),
            ...context,
        };
        // Mask sensitive data in logs
        return (0, data_masking_1.maskObjectForLog)(base);
    }
    debug(message, context) {
        this.logger.debug(this.buildContext(context), message);
    }
    info(message, context) {
        this.logger.info(this.buildContext(context), message);
    }
    warn(message, context) {
        this.logger.warn(this.buildContext(context), message);
    }
    error(message, error, context) {
        const errorContext = error
            ? {
                error: {
                    message: (0, data_masking_1.maskSensitiveData)(error.message),
                    stack: error.stack,
                    name: error.name,
                },
                ...context,
            }
            : context;
        this.logger.error(this.buildContext(errorContext), message);
    }
    child(bindings) {
        const childLogger = new Logger();
        childLogger.logger = this.logger.child(bindings);
        return childLogger;
    }
}
exports.logger = new Logger();
//# sourceMappingURL=index.js.map