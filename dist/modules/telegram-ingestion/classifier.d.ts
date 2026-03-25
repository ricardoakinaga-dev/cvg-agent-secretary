import { TelegramContentType, ClassificationResult, ValidationResult, ContentDestination, TargetTable } from './types';
/**
 * Content Classifier Service
 * Classifies incoming Telegram content and determines routing
 */
declare class ClassifierService {
    /**
     * Classify content type based on patterns and keywords
     */
    classify(content: string, title?: string): ClassificationResult;
    /**
     * Check if content is a command
     */
    private isCommand;
    /**
     * Extract title from content
     */
    private extractTitle;
    /**
     * Extract structured data from content based on type
     */
    private extractStructuredData;
    /**
     * Extract schedule data from content
     */
    private extractScheduleData;
    /**
     * Extract price data from content
     */
    private extractPriceData;
    /**
     * Extract rules from content
     */
    private extractRules;
    /**
     * Extract FAQ Q&A from content
     */
    private extractFaq;
    /**
     * Validate content
     */
    validate(content: string): ValidationResult;
    /**
     * Get routing decision based on content type
     */
    getRouting(type: TelegramContentType): {
        destination: ContentDestination;
        targetTable: TargetTable;
        requiresApproval: boolean;
        initialStatus: 'pending' | 'processed';
    };
}
export declare const classifierService: ClassifierService;
export {};
//# sourceMappingURL=classifier.d.ts.map