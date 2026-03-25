import { TelegramIngestion, CreateTelegramIngestionInput, IngestionStatus, TelegramContentType, OperationalRule, CreateOperationalRuleInput } from './types';
/**
 * Telegram Ingestion Repository
 * Handles database operations for telegram_ingestions and operational_rules
 */
declare class TelegramIngestionRepository {
    /**
     * Create a new telegram ingestion record
     */
    create(input: CreateTelegramIngestionInput): Promise<TelegramIngestion>;
    /**
     * Update ingestion with classification results
     */
    updateWithClassification(id: string, classifiedType: TelegramContentType, confidence: number, title: string, tags: string[], destination: string, targetTable: string, status: IngestionStatus): Promise<TelegramIngestion>;
    /**
     * Update ingestion status
     */
    updateStatus(id: string, status: IngestionStatus, processedBy?: string, knowledgeDocumentId?: string, validationErrors?: string[]): Promise<TelegramIngestion>;
    /**
     * Approve an ingestion
     */
    approve(id: string, approvedBy: string): Promise<TelegramIngestion>;
    /**
     * Reject an ingestion
     */
    reject(id: string, rejectedBy: string, reason: string): Promise<TelegramIngestion>;
    /**
     * Get ingestion by ID
     */
    getById(id: string): Promise<TelegramIngestion | null>;
    /**
     * Get ingestions by status
     */
    getByStatus(status: IngestionStatus, limit?: number): Promise<TelegramIngestion[]>;
    /**
     * Get ingestions by source
     */
    getBySource(source: string, limit?: number): Promise<TelegramIngestion[]>;
    /**
     * Get pending ingestions that need approval
     */
    getPendingApproval(limit?: number): Promise<TelegramIngestion[]>;
    /**
     * Get recent ingestions
     */
    getRecent(limit?: number): Promise<TelegramIngestion[]>;
    /**
     * Create operational rule
     */
    createOperationalRule(input: CreateOperationalRuleInput): Promise<OperationalRule>;
    /**
     * Get operational rule by ID
     */
    getOperationalRuleById(id: string): Promise<OperationalRule | null>;
    /**
     * Get operational rules by type
     */
    getOperationalRulesByType(ruleType: string, activeOnly?: boolean): Promise<OperationalRule[]>;
    /**
     * Get all active operational rules
     */
    getActiveOperationalRules(): Promise<OperationalRule[]>;
    /**
     * Activate operational rule
     */
    activateOperationalRule(id: string): Promise<OperationalRule>;
    /**
     * Deactivate operational rule
     */
    deactivateOperationalRule(id: string): Promise<OperationalRule>;
    /**
     * Map database row to TelegramIngestion
     */
    private mapRowToIngestion;
    /**
     * Map database row to OperationalRule
     */
    private mapRowToOperationalRule;
}
export declare const telegramIngestionRepository: TelegramIngestionRepository;
export {};
//# sourceMappingURL=repository.d.ts.map