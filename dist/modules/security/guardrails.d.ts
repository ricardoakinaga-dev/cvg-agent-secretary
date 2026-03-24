/**
 * Types of fallback responses
 */
export type FallbackType = 'no_knowledge' | 'low_confidence' | 'clarification' | 'handoff_needed';
/**
 * Guardrail result
 */
export interface GuardrailResult {
    allowed: boolean;
    reason?: string;
    fallbackType?: FallbackType;
    modifiedContent?: string;
    action?: 'respond' | 'handoff' | 'block' | 'fallback';
}
/**
 * Generate fallback response based on type
 */
export declare function generateFallbackResponse(type: FallbackType): string;
/**
 * Main guardrail check function
 */
export declare function checkGuardrails(message: string): GuardrailResult;
/**
 * Check if response contains prohibited content
 */
export declare function checkResponseGuardrails(response: string): GuardrailResult;
/**
 * Determine fallback type based on context
 */
export declare function determineFallbackType(hasKnowledge: boolean, knowledgeRelevance: number, confidence: number, userConfirmation?: boolean): FallbackType;
/**
 * Create a safe clinical response that redirects to professional help
 */
export declare function createSafeClinicalResponse(petName?: string): string;
/**
 * Mask sensitive data in logs
 */
export declare function maskSensitiveData(text: string): string;
//# sourceMappingURL=guardrails.d.ts.map