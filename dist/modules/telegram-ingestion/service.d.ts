import { TelegramIngestion, CreateTelegramIngestionInput, IngestionResult, ClassificationResult, ValidationResult } from './types';
/**
 * Telegram Ingestion Service
 * Orchestrates the complete ingestion pipeline
 */
declare class TelegramIngestionService {
    /**
     * Receive and process new content from Telegram
     * This is the main entry point for ingestion
     */
    receiveContent(input: CreateTelegramIngestionInput): Promise<IngestionResult>;
    /**
     * Process content to its destination (RAG or Postgres)
     */
    private processToDestination;
    /**
     * Approve an ingestion for publishing
     */
    approveIngestion(ingestionId: string, approvedBy: string): Promise<IngestionResult>;
    /**
     * Reject an ingestion
     */
    rejectIngestion(ingestionId: string, rejectedBy: string, reason: string): Promise<IngestionResult>;
    /**
     * Get ingestion by ID
     */
    getIngestion(id: string): Promise<TelegramIngestion | null>;
    /**
     * Get pending ingestions
     */
    getPendingIngestions(limit?: number): Promise<TelegramIngestion[]>;
    /**
     * Get recent ingestions
     */
    getRecentIngestions(limit?: number): Promise<TelegramIngestion[]>;
    /**
     * Classify content without creating ingestion
     * Useful for previewing classification
     */
    classifyContent(content: string, title?: string): ClassificationResult;
    /**
     * Validate content without creating ingestion
     */
    validateContent(content: string): ValidationResult;
    /**
     * Get operational rules
     */
    getOperationalRules(ruleType?: string): Promise<import("./types").OperationalRule[]>;
}
export declare const telegramIngestionService: TelegramIngestionService;
export {};
//# sourceMappingURL=service.d.ts.map