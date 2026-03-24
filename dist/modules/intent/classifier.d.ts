import { IntentClassification, ClassificationContext } from './types';
/**
 * Classify the intent of a message
 */
export declare function classifyIntent(message: string, context?: ClassificationContext): IntentClassification;
/**
 * Get recommended response action based on intent
 */
export declare function getRecommendedAction(classification: IntentClassification): {
    shouldRespond: boolean;
    shouldUseKnowledge: boolean;
    responseTone: 'empathetic' | 'informative' | 'urgent' | 'neutral';
};
//# sourceMappingURL=classifier.d.ts.map