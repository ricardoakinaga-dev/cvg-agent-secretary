import { TelegramContentType, IngestionSource } from './types';
/**
 * Input for ingest_telegram_content tool
 */
export interface IngestTelegramContentInput {
    content: string;
    source?: IngestionSource;
    classification?: TelegramContentType;
    title?: string;
}
/**
 * Output from ingest_telegram_content tool
 */
export interface IngestTelegramContentOutput {
    success: boolean;
    ingestionId: string;
    status: string;
    message: string;
    classification?: {
        type: TelegramContentType;
        confidence: number;
        title: string;
    };
    destination?: string;
    knowledgeDocumentId?: string;
}
/**
 * Tool: ingest_telegram_content
 * Processes content sent via Telegram for knowledge base ingestion
 */
export declare function ingestTelegramContent(input: IngestTelegramContentInput): Promise<IngestTelegramContentOutput>;
/**
 * Tool: approve_content
 * Approves content for publishing to knowledge base
 */
export declare function approveContent(ingestionId: string, approvedBy: string): Promise<{
    success: boolean;
    message: string;
    knowledgeDocumentId?: string;
}>;
/**
 * Tool: reject_content
 * Rejects content from being published
 */
export declare function rejectContent(ingestionId: string, rejectedBy: string, reason: string): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Tool: preview_classification
 * Previews how content would be classified without creating ingestion
 */
export declare function previewClassification(content: string, title?: string): {
    type: TelegramContentType;
    confidence: number;
    title: string;
    tags: string[];
    destination: string;
    requiresApproval: boolean;
};
/**
 * Tool: list_pending_content
 * Lists content awaiting approval
 */
export declare function listPendingContent(limit?: number): Promise<{
    success: boolean;
    count: number;
    ingestions: Array<{
        id: string;
        title: string;
        type: string;
        source: string;
        createdAt: string;
    }>;
}>;
/**
 * Export all telegram ingestion tools
 */
export declare const telegramIngestionTools: {
    ingest_telegram_content: typeof ingestTelegramContent;
    approve_content: typeof approveContent;
    reject_content: typeof rejectContent;
    preview_classification: typeof previewClassification;
    list_pending_content: typeof listPendingContent;
};
export type TelegramIngestionToolName = keyof typeof telegramIngestionTools;
//# sourceMappingURL=tools.d.ts.map