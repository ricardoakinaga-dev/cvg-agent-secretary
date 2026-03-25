// Telegram Ingestion Types
// Phase 5: Telegram Ingestion and Knowledge Self-Feeding

/**
 * Types of content that can be received via Telegram
 */
export type TelegramContentType =
  | 'faq'           // Frequently asked question
  | 'policy'        // Hospital policy
  | 'procedure'     // Procedure/instruction
  | 'rule'          // Operational rule
  | 'command'       // System command
  | 'feedback'      // Feedback content
  | 'schedule'      // Schedule/hours information
  | 'price'         // Pricing information
  | 'instruction';  // Internal instruction

/**
 * Content destination after classification
 */
export type ContentDestination =
  | 'rag'           // Vector store (RAG)
  | 'postgres'      // Structured Postgres table
  | 'both'          // Both RAG and Postgres
  | 'rejected';     // Content rejected

/**
 * Target table for structured data
 */
export type TargetTable =
  | 'knowledge_documents'
  | 'operational_rules'
  | 'schedules'
  | 'prices';

/**
 * Ingestion status in the processing pipeline
 */
export type IngestionStatus =
  | 'pending'           // Just received
  | 'classified'        // Classified by type
  | 'validated'         // Passed validation
  | 'routed'            // Destination decided
  | 'processed'         // Processed to destination
  | 'approved'          // Approved for publishing
  | 'published'         // Published to knowledge base
  | 'rejected'          // Rejected
  | 'failed';           // Failed processing

/**
 * Content source
 */
export type IngestionSource =
  | 'telegram'
  | 'manual'
  | 'api';

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
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  chunkSize: 500,
  chunkOverlap: 50,
  strategy: 'markdown-aware',
};

/**
 * Minimum and maximum content lengths
 */
export const CONTENT_LIMITS = {
  minLength: 50,
  maxLength: 50000,
} as const;

/**
 * Classification confidence thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.5,
  low: 0.3,
} as const;
