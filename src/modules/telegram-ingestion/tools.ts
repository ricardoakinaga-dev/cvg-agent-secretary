// Telegram Ingestion Tools for Agent
// Phase 5: Tools for ingesting Telegram content

import { logger } from '../logging/index';
import { telegramIngestionService } from './service';
import { classifierService } from './classifier';
import { TelegramContentType, IngestionResult, IngestionSource } from './types';

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
export async function ingestTelegramContent(
  input: IngestTelegramContentInput
): Promise<IngestTelegramContentOutput> {
  try {
    logger.info('Tool ingest_telegram_content called', {
      contentLength: input.content?.length,
      source: input.source,
      classification: input.classification,
    });

    // Validate input
    if (!input.content || input.content.trim().length === 0) {
      throw new Error('Content is required');
    }

    // If classification provided, skip auto-classification
    let result: IngestionResult;

    if (input.classification) {
      // Use provided classification - process directly
      // This path is for when admin wants to force a specific type
      result = await telegramIngestionService.receiveContent({
        rawContent: input.content,
        source: input.source || 'manual',
        title: input.title,
      });
    } else {
      // Auto-classify content
      result = await telegramIngestionService.receiveContent({
        rawContent: input.content,
        source: input.source || 'manual',
        title: input.title,
      });
    }

    // Get classification details for response
    const classification = telegramIngestionService.classifyContent(
      input.content,
      input.title
    );

    logger.info('Tool ingest_telegram_content completed', {
      ingestionId: result.ingestionId,
      status: result.status,
      success: result.success,
    });

    return {
      success: result.success,
      ingestionId: result.ingestionId,
      status: result.status,
      message: result.message,
      classification: {
        type: classification.type,
        confidence: classification.confidence,
        title: classification.title,
      },
      destination: result.success ? 'pending_review' : undefined,
      knowledgeDocumentId: result.knowledgeDocumentId,
    };
  } catch (error) {
    logger.error('Tool ingest_telegram_content failed', error as Error, {
      input: { contentLength: input.content?.length },
    });

    return {
      success: false,
      ingestionId: '',
      status: 'failed',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Tool: approve_content
 * Approves content for publishing to knowledge base
 */
export async function approveContent(
  ingestionId: string,
  approvedBy: string
): Promise<{
  success: boolean;
  message: string;
  knowledgeDocumentId?: string;
}> {
  try {
    logger.info('Tool approve_content called', {
      ingestionId,
      approvedBy,
    });

    const result = await telegramIngestionService.approveIngestion(
      ingestionId,
      approvedBy
    );

    return {
      success: result.success,
      message: result.message,
      knowledgeDocumentId: result.knowledgeDocumentId,
    };
  } catch (error) {
    logger.error('Tool approve_content failed', error as Error, {
      ingestionId,
    });

    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Tool: reject_content
 * Rejects content from being published
 */
export async function rejectContent(
  ingestionId: string,
  rejectedBy: string,
  reason: string
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    logger.info('Tool reject_content called', {
      ingestionId,
      rejectedBy,
      reason,
    });

    const result = await telegramIngestionService.rejectIngestion(
      ingestionId,
      rejectedBy,
      reason
    );

    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    logger.error('Tool reject_content failed', error as Error, {
      ingestionId,
    });

    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Tool: preview_classification
 * Previews how content would be classified without creating ingestion
 */
export function previewClassification(
  content: string,
  title?: string
): {
  type: TelegramContentType;
  confidence: number;
  title: string;
  tags: string[];
  destination: string;
  requiresApproval: boolean;
} {
  const classification = telegramIngestionService.classifyContent(content, title);
  const routing = classifierService.getRouting(classification.type);

  return {
    type: classification.type,
    confidence: classification.confidence,
    title: classification.title,
    tags: classification.tags,
    destination: routing.destination,
    requiresApproval: routing.requiresApproval,
  };
}

/**
 * Tool: list_pending_content
 * Lists content awaiting approval
 */
export async function listPendingContent(
  limit = 50
): Promise<{
  success: boolean;
  count: number;
  ingestions: Array<{
    id: string;
    title: string;
    type: string;
    source: string;
    createdAt: string;
  }>;
}> {
  try {
    const pending = await telegramIngestionService.getPendingIngestions(limit);

    return {
      success: true,
      count: pending.length,
      ingestions: pending.map(i => ({
        id: i.id,
        title: i.title || 'Untitled',
        type: i.classifiedType,
        source: i.source,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    logger.error('Tool list_pending_content failed', error as Error);

    return {
      success: false,
      count: 0,
      ingestions: [],
    };
  }
}

/**
 * Export all telegram ingestion tools
 */
export const telegramIngestionTools = {
  ingest_telegram_content: ingestTelegramContent,
  approve_content: approveContent,
  reject_content: rejectContent,
  preview_classification: previewClassification,
  list_pending_content: listPendingContent,
};

export type TelegramIngestionToolName = keyof typeof telegramIngestionTools;
