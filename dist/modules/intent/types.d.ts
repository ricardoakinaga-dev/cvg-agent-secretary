/**
 * Supported intents for the CVG Secretary Agent
 * Based on specs/02_AGENT_BEHAVIOR.md and specs/08_HANDOFF_SYSTEM.md
 */
export type IntentType = 'saudacao' | 'duvida_operacional' | 'pedido_informacao' | 'coleta_dados' | 'possivel_urgencia' | 'reclamacao' | 'financeiro_sensivel' | 'pedido_humano' | 'agendamento' | 'cancelamento' | 'duvida_clinica' | 'informacao_pet' | 'horarios' | 'servicos' | 'precos' | '不明' | 'none';
/**
 * Priority levels for intents
 */
export type IntentPriority = 'critical' | 'high' | 'medium' | 'low';
/**
 * Intent classification result
 */
export interface IntentClassification {
    intent: IntentType;
    confidence: number;
    priority: IntentPriority;
    detectedKeywords: string[];
    entities: IntentEntities;
    requiresHandoff: boolean;
    handoffReason?: string;
    riskLevel?: 'high' | 'medium' | 'low';
}
/**
 * Entities extracted from the message
 */
export interface IntentEntities {
    petName?: string;
    petSpecies?: string;
    serviceType?: string;
    date?: string;
    time?: string;
    phone?: string;
    email?: string;
    value?: number;
}
/**
 * Urgency indicators that trigger immediate handoff
 */
export interface UrgencyIndicator {
    pattern: RegExp;
    priority: IntentPriority;
    requiresHandoff: boolean;
    handoffReason: string;
    riskLevel: 'high' | 'medium' | 'low';
}
/**
 * Sensitive financial patterns
 */
export interface FinancialPattern {
    pattern: RegExp;
    requiresHandoff: boolean;
}
/**
 * Complaint indicators
 */
export interface ComplaintIndicator {
    pattern: RegExp;
    requiresHandoff: boolean;
    severity: 'high' | 'medium';
}
/**
 * Classification context for additional information
 */
export interface ClassificationContext {
    conversationHistory?: string[];
    hasPetContext?: boolean;
    contactName?: string;
    previousIntent?: IntentType;
}
//# sourceMappingURL=types.d.ts.map