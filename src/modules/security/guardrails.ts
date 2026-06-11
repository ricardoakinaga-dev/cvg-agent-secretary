// Security Guardrails for Phase 4
// Based on specs/10_SECURITY_AND_GUARDRAILS.md

import { logger } from '../logging';
import { KnowledgeChunk } from '../../shared/types';
import { hasPriceEvidence, isPricingQuery, supportedPrices } from '../knowledge/context';
import { maskSensitiveData as maskSharedSensitiveData } from '../../shared/data-masking';

/**
 * Types of fallback responses
 */
export type FallbackType = 
  | 'no_knowledge'    // No information found
  | 'low_confidence'  // Found but with low certainty
  | 'clarification'   // Needs more information
  | 'handoff_needed'  // Needs human intervention
  | 'security_block'; // Security policy blocked the request

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
  /(?:meu|me|a)\s+(?:pet|cachorro|gato|animal)\s+(?:tem|possui|está|esta|está\s+com|esta\s+com)\s+\w+/i,
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
  /ignore\s+(?:as|instru[cç][oõ]es|regras|diretrizes)\s+(?:anteriores|acima|do\s+sistema)/i,
  /desconsidere\s+(?:as\s+)?(?:instru[cç][oõ]es|regras|diretrizes)\s+(?:anteriores|acima|do\s+sistema)/i,
  /ignore\s+all\s+(?:previous|prior)\s+(?:instructions?|rules?|guidelines?)/i,
  /you\s+are\s+(?:now|free)\s+to/i,
  /new\s+instructions?:/i,
  /novas?\s+instru[cç][oõ]es?:/i,
  /<\|.*?\|>/i,  // Prompt injection markers
  /\b(?:system|developer|assistant)\s*:/i,
  /\b(?:sistema|desenvolvedor|assistente)\s*:/i,
  /reveal\s+(?:your\s+)?(?:system\s+prompt|instructions?|rules?)/i,
  /(?:mostre|revele|exiba|cole|imprima)\s+(?:o\s+)?(?:prompt|instru[cç][oõ]es|regras)\s+(?:do\s+)?(?:sistema|desenvolvedor)/i,
  /\b(?:modo\s+desenvolvedor|developer\s+mode|dan\s+mode|jailbreak)\b/i,
  /execute\s+(?:comando|c[oó]digo|script)/i,
];

/**
 * Sensitive information patterns that should not be processed
 */
const SENSITIVE_DATA_PATTERNS: RegExp[] = [
  /\d{3}\.\d{3}\.\d{3}-\d{2}/,  // CPF
  /\b\d{11}\b/, // CPF digits only
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/,  // CNPJ
  /\b\d{14}\b/, // CNPJ digits only
  /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/,  // Credit card
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, // Email
  /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}\b/, // BR phone
];

const DATA_EXFILTRATION_PATTERNS: RegExp[] = [
  /(?:liste|listar|mostre|mostrar|revele|revelar|exiba|enviar|envie|me\s+d[eê])\s+(?:todos?\s+os\s+|todas?\s+as\s+)?(?:clientes|contatos|telefones|emails|e-mails|cpfs|cnpjs|endere[cç]os)/i,
  /(?:liste|listar|mostre|mostrar|revele|revelar|exiba|enviar|envie|me\s+d[eê])\s+(?:os\s+)?(?:clientes|contatos|telefones|emails|e-mails|cpfs|cnpjs|endere[cç]os)/i,
  /(?:dados|informa[cç][oõ]es)\s+(?:dos?|de)\s+(?:clientes|contatos|tutores|pacientes|pets)/i,
  /(?:telefone|cpf|cnpj|email|e-mail|endere[cç]o)\s+(?:de|do|da)\s+(?:outro|cliente|tutor|paciente)/i,
  /(?:chave|token|senha|api[_\s-]?key|secret|segredo)/i,
  /(?:banco\s+de\s+dados|redis|postgres|qdrant|logs?|vari[aá]veis?\s+de\s+ambiente)/i,
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

function isDataExfiltrationAttempt(message: string): boolean {
  return DATA_EXFILTRATION_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Check if message contains sensitive data
 */
function containsSensitiveData(message: string): boolean {
  return SENSITIVE_DATA_PATTERNS.some(pattern => pattern.test(message));
}

export function sanitizeForPrompt(text: string): string {
  return maskSharedSensitiveData(text);
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
    case 'security_block':
      return 'Não posso ajudar com solicitações para alterar minhas instruções, acessar informações internas ou expor dados de clientes. Posso ajudar com dúvidas sobre atendimento, serviços, horários e agendamentos.';
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
    logger.warn('Jailbreak attempt detected', { messageLength: message.length });
    return {
      allowed: false,
      reason: 'Tentativa de manipulação detectada',
      fallbackType: 'security_block',
      action: 'block',
    };
  }

  if (isDataExfiltrationAttempt(message)) {
    logger.warn('Data exfiltration attempt detected', { messageLength: message.length });
    return {
      allowed: false,
      reason: 'Tentativa de acesso a dados internos ou de clientes',
      fallbackType: 'security_block',
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
    { pattern: /(?:recomendo|indic[oa])\s+(?:dar|usar|aplicar|tomar)?\s*(?:remédio|medicamento|tratamento|antibiótico|antibiotico)/i, type: 'prescription' },
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

  if (containsSensitiveData(response)) {
    logger.warn('Sensitive data in response blocked', {
      responseLength: response.length,
    });
    return {
      allowed: false,
      reason: 'Resposta contém dados sensíveis',
      fallbackType: 'security_block',
      action: 'block',
    };
  }

  if (isJailbreakAttempt(response) || isDataExfiltrationAttempt(response)) {
    logger.warn('Unsafe internal/security content in response blocked', {
      responseLength: response.length,
    });
    return {
      allowed: false,
      reason: 'Resposta contém conteúdo interno ou inseguro',
      fallbackType: 'security_block',
      action: 'block',
    };
  }

  return {
    allowed: true,
    action: 'respond',
  };
}

/**
 * Prevent commercial answers from inventing prices outside the retrieved evidence.
 */
export function checkCommercialResponseGuardrails(
  message: string,
  response: string,
  knowledge: KnowledgeChunk[]
): GuardrailResult {
  if (!isPricingQuery(message)) {
    return {
      allowed: true,
      action: 'respond',
    };
  }

  if (!hasPriceEvidence(knowledge)) {
    logger.warn('Pricing response blocked because no price evidence was retrieved', {
      message: message.substring(0, 100),
    });
    return {
      allowed: false,
      reason: 'Resposta de preço sem evidência na base',
      fallbackType: 'no_knowledge',
      action: 'fallback',
    };
  }

  const pricesInResponse = supportedPrices([{ id: 'response', content: response, source: 'ai', relevance: 1 }]);
  if (pricesInResponse.length === 0) {
    return {
      allowed: true,
      action: 'respond',
    };
  }

  const allowedPrices = supportedPrices(knowledge);
  const unsupportedPrices = pricesInResponse.filter((price) => !allowedPrices.includes(price));
  if (unsupportedPrices.length > 0) {
    logger.warn('Pricing response blocked because it contains unsupported prices', {
      unsupportedPrices,
      allowedPrices,
    });
    return {
      allowed: false,
      reason: 'Resposta contém preço sem suporte na base',
      fallbackType: 'low_confidence',
      action: 'fallback',
    };
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
  
  return maskSharedSensitiveData(masked);
}
