// Security Guardrails for Phase 4
// Based on specs/10_SECURITY_AND_GUARDRAILS.md

import { logger } from '../logging';

/**
 * Types of fallback responses
 */
export type FallbackType = 
  | 'no_knowledge'    // No information found
  | 'low_confidence'  // Found but with low certainty
  | 'clarification'   // Needs more information
  | 'handoff_needed'; // Needs human intervention

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
 * Clinical content patterns that should be blocked
 */
const CLINICAL_BLOCK_PATTERNS: RegExp[] = [
  // Diagnosis patterns
  /(?:meu|me|a)\s+(?:pet|cachorro|gato|animal)\s+(?:tem|possui|está\s+com)\s+\w+/i,
  // Symptom patterns  
  /(?:diagnóstico|diagnosticar|diagnostico)/i,
  // Prescription patterns
  /(?:prescrever|prescrição|remédio|medicamento)\s+(?:para|ao)/i,
  // Prognosis patterns
  /(?:vai\s+ficar|vai\s+melhorar|prognóstico|pronóstico)/i,
  // Treatment recommendation
  /(?:tratamento|terapia)\s+(?:recomend|indic|para)/i,
  // Interpretation of exams
  /(?:exame\s+de|resultado\s+do)\s+(?:sangue|urina|raio\s+x|ultrassom)/i,
];

/**
 * Patterns that indicate the user is trying to bypass the system
 */
const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore\s+(?:all|previous|prior)\s+(?:instructions?|rules?|guidelines?)/i,
  /you\s+are\s+(?:now|free)\s+to/i,
  /new\s+instructions?:/i,
  /<\|.*?\|>/i,  // Prompt injection markers
  /system\s*:/i,
];

/**
 * Sensitive information patterns that should not be processed
 */
const SENSITIVE_DATA_PATTERNS: RegExp[] = [
  /\d{3}\.\d{3}\.\d{3}-\d{2}/,  // CPF
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/,  // CNPJ
  /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/,  // Credit card
];

/**
 * Check if message contains clinical content that should be blocked
 */
function containsClinicalContent(message: string): boolean {
  return CLINICAL_BLOCK_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Check if message appears to be a jailbreak attempt
 */
function isJailbreakAttempt(message: string): boolean {
  return JAILBREAK_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Check if message contains sensitive data
 */
function containsSensitiveData(message: string): boolean {
  return SENSITIVE_DATA_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Generate fallback response based on type
 */
export function generateFallbackResponse(type: FallbackType): string {
  switch (type) {
    case 'no_knowledge':
      return 'Não tenho essa informação específica no momento. Posso verificar com um de nossos atendentes para te ajudar melhor.';
    case 'low_confidence':
      return 'Não tenho total certeza sobre isso. Para garantir a informação correta, vou verificar com um atendente. Pode aguardar um momento?';
    case 'clarification':
      return 'Para ajudar melhor, você poderia me explicar mais sobre o que você precisa?';
    case 'handoff_needed':
      return 'Vou transferir você para um de nossos atendentes que pode te ajudar com isso.';
    default:
      return 'Peço desculpas, não consegui entender sua solicitação. Um atendente logo irá ajudá-lo.';
  }
}

/**
 * Main guardrail check function
 */
export function checkGuardrails(message: string): GuardrailResult {
  // Check for jailbreak attempts
  if (isJailbreakAttempt(message)) {
    logger.warn('Jailbreak attempt detected', { message: message.substring(0, 100) });
    return {
      allowed: false,
      reason: 'Tentativa de manipulação detectada',
      action: 'block',
    };
  }

  // Check for sensitive data - just log but don't block
  if (containsSensitiveData(message)) {
    logger.info('Sensitive data detected in message', { 
      containsCPF: /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(message)
    });
    // We don't block, but we should be careful
  }

  // Check for clinical content - allow but with guardrails
  if (containsClinicalContent(message)) {
    logger.info('Clinical content detected, applying guardrails', { 
      message: message.substring(0, 100) 
    });
    return {
      allowed: true,
      reason: 'Conteúdo clínico detectado',
      action: 'respond',
    };
  }

  // No issues found
  return {
    allowed: true,
    action: 'respond',
  };
}

/**
 * Check if response contains prohibited content
 */
export function checkResponseGuardrails(response: string): GuardrailResult {
  const prohibitedPatterns = [
    { pattern: /(?:seu\s+pet\s+tem|seu\s+cachorro\s+tem|seu\s+gato\s+tem)\s+\w+/i, type: 'diagnosis' },
    { pattern: /(?:recomendo|indic[oa])\s+(?:remédio|medicamento|tratamento)/i, type: 'prescription' },
    { pattern: /(?:vai\s+ficar|vai\s+melhorar)\s+\w+/i, type: 'prognosis' },
  ];

  for (const { pattern, type } of prohibitedPatterns) {
    if (pattern.test(response)) {
      logger.warn('Prohibited content in response', { type, response: response.substring(0, 100) });
      return {
        allowed: false,
        reason: `Resposta contém ${type} prohibited`,
        action: 'handoff',
      };
    }
  }

  return {
    allowed: true,
    action: 'respond',
  };
}

/**
 * Determine fallback type based on context
 */
export function determineFallbackType(
  hasKnowledge: boolean,
  knowledgeRelevance: number,
  confidence: number,
  userConfirmation?: boolean
): FallbackType {
  // If we have knowledge but low relevance
  if (hasKnowledge && knowledgeRelevance < 0.5) {
    return 'low_confidence';
  }

  // If we have knowledge but agent confidence is low
  if (hasKnowledge && confidence < 0.6) {
    return 'low_confidence';
  }

  // If we don't have knowledge
  if (!hasKnowledge) {
    return 'no_knowledge';
  }

  // If user seems confused or unsatisfied (could be passed from agent)
  if (userConfirmation === false) {
    return 'handoff_needed';
  }

  // Default to asking for clarification
  return 'clarification';
}

/**
 * Create a safe clinical response that redirects to professional help
 */
export function createSafeClinicalResponse(petName?: string): string {
  const namePart = petName ? ` ${petName}` : '';
  return `Entendo sua preocupação com${namePart}. Para dar a melhor orientação, preciso avaliá-lo presencialmente. Posso agendar uma consulta para você?`;
}

/**
 * Mask sensitive data in logs
 */
export function maskSensitiveData(text: string): string {
  let masked = text;
  
  // Mask CPF
  masked = masked.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '***.***.***-**');
  
  // Mask CNPJ
  masked = masked.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '**.***.***/****-**');
  
  // Mask credit card (simple pattern)
  masked = masked.replace(/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, '**** **** **** ****');
  
  return masked;
}
