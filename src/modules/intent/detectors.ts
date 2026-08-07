import type { ClassificationContext, IntentEntities, IntentPriority } from './types';
import {
  COMPLAINT_INDICATORS,
  FINANCIAL_PATTERNS,
  HUMAN_REQUEST_PATTERNS,
  SCHEDULING_FOLLOW_UP_PATTERNS,
  URGENCY_INDICATORS,
} from './patterns';

/** Extract structured entities without retaining or logging the input. */
export function extractEntities(message: string): IntentEntities {
  const entities: IntentEntities = {};

  // Extract phone number
  const phoneMatch = message.match(/\+?\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/);
  if (phoneMatch) {
    entities.phone = phoneMatch[0];
  }

  // Extract email
  const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    entities.email = emailMatch[0];
  }

  // Extract a pet name while excluding common verbs/adjectives that follow
  // generic pet nouns (for example, "meu pet está vomitando").
  const petNameMatch = message.match(
    /(?:pet|cachorro|cachorra|gato|gata|animal|meu\s+bichinho)\s+(?:se\s+chama\s+|chama-se\s+)?([\p{L}][\p{L}'-]{1,60})/iu
  );
  const nonNameWords = new Set([
    'anda', 'comeu', 'está', 'esta', 'ficou', 'foi', 'muito', 'não', 'nao',
    'parou', 'parece', 'precisa', 'tem', 'teve', 'vomitou', 'vomitando',
  ]);
  if (petNameMatch && !nonNameWords.has(petNameMatch[1].toLowerCase())) {
    entities.petName = petNameMatch[1];
  }

  // Extract species
  if (/cachorro|cao|dog|bichinho/i.test(message)) {
    entities.petSpecies = 'cachorro';
  } else if (/gato|cat/i.test(message)) {
    entities.petSpecies = 'gato';
  } else if (/pássaro|passo|bird/i.test(message)) {
    entities.petSpecies = 'pássaro';
  }

  // Extract monetary value
  const valueMatch = message.match(/(?:R\$|reais?|R\s*)(\d+(?:[.,]\d{2})?)/i);
  if (valueMatch && valueMatch[1]) {
    entities.value = parseFloat(valueMatch[1].replace(',', '.'));
  }

  // Extract service type
  const serviceMatch = message.match(/(banho|tosa|vacina|consulta|exame|cirurgia|emergência|internação)/i);
  if (serviceMatch) {
    entities.serviceType = serviceMatch[1].toLowerCase();
  }

  return entities;
}
/**
 * Detect urgency in message
 */
export function detectUrgency(message: string): { priority: IntentPriority; requiresHandoff: boolean; reason: string; riskLevel: 'high' | 'medium' | 'low' } | null {
  for (const indicator of URGENCY_INDICATORS) {
    if (indicator.pattern.test(message)) {
      return {
        priority: indicator.priority,
        requiresHandoff: indicator.requiresHandoff,
        reason: indicator.handoffReason,
        riskLevel: indicator.riskLevel,
      };
    }
  }
  return null;
}

/**
 * Detect complaint in message
 */
export function detectComplaint(message: string): { requiresHandoff: boolean; severity: 'high' | 'medium' } | null {
  for (const indicator of COMPLAINT_INDICATORS) {
    if (indicator.pattern.test(message)) {
      return {
        requiresHandoff: indicator.requiresHandoff,
        severity: indicator.severity,
      };
    }
  }
  return null;
}

/**
 * Detect financial sensitivity
 */
export function detectFinancialSensitivity(message: string): boolean {
  for (const pattern of FINANCIAL_PATTERNS) {
    if (pattern.pattern.test(message)) {
      return pattern.requiresHandoff;
    }
  }
  return false;
}

/**
 * Check if user is requesting human agent
 */
export function detectHumanRequest(message: string): boolean {
  return HUMAN_REQUEST_PATTERNS.some(pattern => pattern.test(message));
}

export function hasSchedulingContext(context?: ClassificationContext): boolean {
  if (context?.previousIntent === 'agendamento') {
    return true;
  }

  return Boolean(context?.conversationHistory?.some((item) =>
    /agend|marcar|consulta|hor[aá]rio|data/i.test(item)
  ));
}

export function looksLikeSchedulingFollowUp(message: string, context?: ClassificationContext): boolean {
  if (!hasSchedulingContext(context)) {
    return false;
  }

  return SCHEDULING_FOLLOW_UP_PATTERNS.some(pattern => pattern.test(message));
}
