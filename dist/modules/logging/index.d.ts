export interface LogContext {
    correlationId?: string;
    conversationId?: string;
    contactId?: string;
    messageId?: string;
    [key: string]: unknown;
}
declare class Logger {
    private logger;
    constructor();
    private buildContext;
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, error?: Error, context?: LogContext): void;
    child(bindings: LogContext): Logger;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=index.d.ts.map