/**
 * Types of content that can be received via Telegram
 */
export type TelegramContentType = 'faq' | 'policy' | 'procedure' | 'rule' | 'command' | 'feedback' | 'schedule' | 'price' | 'instruction';
/**
 * Content destination after classification
 */
export type ContentDestination = 'rag' | 'postgres' | 'both' | 'rejected';
/**
 * Target table for structured data
 */
export type TargetTable = 'knowledge_documents' | 'operational_rules' | 'schedules' | 'prices';
/**
 * Ingestion status in the processing pipeline
 */
export type IngestionStatus = 'pending' | 'classified' | 'validated' | 'routed' | 'processed' | 'approved' | 'published' | 'rejected' | 'failed';
/**
 * Content source
 */
export type IngestionSource = 'telegram' | 'manual' | 'api';
/**
 * Classification result with metadata
 */
export interface ClassificationResult {
    type: TelegramContentType;
    confidence: number;
    title: string;
    tags: string[];
    extractedData?: Record<string, unknown>;
}
/**
 * Validation result
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Telegram ingestion record
 */
export interface TelegramIngestion {
    id: string;
    telegramChatId?: number;
    telegramMessageId?: number;
    source: IngestionSource;
    rawContent: string;
    title?: string;
    classifiedType: TelegramContentType;
    classificationConfidence: number;
    destination: ContentDestination;
    targetTable?: TargetTable;
    status: IngestionStatus;
    validationErrors: string[];
    contentLength: number;
    language: string;
    tags: string[];
    metadata: Record<string, unknown>;
    knowledgeDocumentId?: string;
    processedBy?: string;
    processedAt?: Date;
    approvedBy?: string;
    approvedAt?: Date;
    rejectionReason?: string;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Input for creating a new ingestion
 */
export interface CreateTelegramIngestionInput {
    telegramChatId?: number;
    telegramMessageId?: number;
    source?: IngestionSource;
    rawContent: string;
    title?: string;
}
/**
 * Input for classifying content
 */
export interface ClassifyContentInput {
    content: string;
    title?: string;
    source?: string;
}
/**
 * Input for processing ingestion
 */
export interface ProcessIngestionInput {
    ingestionId: string;
    processedBy?: string;
}
/**
 * Input for approving ingestion
 */
export interface ApproveIngestionInput {
    ingestionId: string;
    approvedBy: string;
}
/**
 * Input for rejecting ingestion
 */
export interface RejectIngestionInput {
    ingestionId: string;
    rejectedBy: string;
    reason: string;
}
/**
 * Result of ingestion processing
 */
export interface IngestionResult {
    success: boolean;
    ingestionId: string;
    status: IngestionStatus;
    message: string;
    knowledgeDocumentId?: string;
    operationalRuleId?: string;
}
/**
 * Operational rule structure
 */
export interface OperationalRule {
    id: string;
    name: string;
    description?: string;
    ruleType: string;
    content: Record<string, unknown>;
    version: number;
    source: string;
    sourceId?: string;
    status: string;
    effectiveFrom?: Date;
    effectiveTo?: Date;
    createdBy?: string;
    approvedBy?: string;
    approvedAt?: Date;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Input for creating operational rule
 */
export interface CreateOperationalRuleInput {
    name: string;
    description?: string;
    ruleType: string;
    content: Record<string, unknown>;
    source?: string;
    sourceId?: string;
    createdBy?: string;
}
/**
 * Chunking configuration for RAG
 */
export interface ChunkingConfig {
    chunkSize: number;
    chunkOverlap: number;
    strategy: 'markdown-aware' | 'fixed-size' | 'semantic';
}
/**
 * Default chunking configuration
 */
export declare const DEFAULT_CHUNKING_CONFIG: ChunkingConfig;
/**
 * Minimum and maximum content lengths
 */
export declare const CONTENT_LIMITS: {
    readonly minLength: 50;
    readonly maxLength: 50000;
};
/**
 * Classification confidence thresholds
 */
export declare const CONFIDENCE_THRESHOLDS: {
    readonly high: 0.8;
    readonly medium: 0.5;
    readonly low: 0.3;
};
//# sourceMappingURL=types.d.ts.map