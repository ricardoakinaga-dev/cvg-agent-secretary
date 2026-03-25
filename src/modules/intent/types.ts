// Intent types for Phase 4 - Operational Secretary

/**
 * Supported intents for the CVG Secretary Agent
 * Based on specs/02_AGENT_BEHAVIOR.md and specs/08_HANDOFF_SYSTEM.md
 */
export type IntentType =
  // Primary intents
  | 'saudacao'           // Greeting / reception
  | 'duvida_operacional' // Operational question
  | 'pedido_informacao'  // Request for information
  | 'coleta_dados'       // Data collection
  | 'possivel_urgencia' // Possible urgency (emergency)
  | 'reclamacao'        // Complaint
  | 'financeiro_sensivel' // Sensitive financial matter
  | 'pedido_humano'      // Request for human agent
  // Secondary intents
  | 'agendamento'        // Scheduling
  | 'cancelamento'       // Cancellation
  | 'duvida_clinica'     // Clinical question
  | 'informacao_pet'     // Pet information query
  | 'horarios'           // Hours of operation
  | 'servicos'           // Services inquiry
  | 'precos'             // Prices inquiry
  | '不明'               // Unknown / unclear
  | 'none';              // No intent detected

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
