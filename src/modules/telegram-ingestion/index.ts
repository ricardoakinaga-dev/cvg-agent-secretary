// Telegram Ingestion Module
// Phase 5: Telegram Ingestion and Knowledge Self-Feeding

export * from './types';
export * from './classifier';
export * from './repository';
export * from './service';
export * from './tools';

// Re-export tools for easy access
export {
  ingestTelegramContent,
  approveContent,
  rejectContent,
  previewClassification,
  listPendingContent,
  telegramIngestionTools,
} from './tools';

export type { IngestTelegramContentInput, IngestTelegramContentOutput } from './tools';
