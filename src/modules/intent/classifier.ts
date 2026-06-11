// Intent Classifier for Phase 4 - Operational Secretary
// Based on specs/02_AGENT_BEHAVIOR.md, specs/08_HANDOFF_SYSTEM.md, specs/10_SECURITY_AND_GUARDRAILS.md

import { logger } from '../logging';
import {
  IntentType,
  IntentPriority,
  IntentClassification,
  IntentEntities,
  UrgencyIndicator,
  FinancialPattern,
  ComplaintIndicator,
  ClassificationContext,
} from './types';

/**
 * Urgency indicators that trigger immediate handoff
 * Based on specs/10_SECURITY_AND_GUARDRAILS.md
 */
const URGENCY_INDICATORS: UrgencyIndicator[] = [
  // Critical - immediate handoff
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal|dog|cat)\s+(?:não\s+)?(?:consegue\s+)?respirar/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - dificuldade respiratória',
    riskLevel: 'high',
  },
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:comeu|ingeriu|engoliu)\s+(?:veneno|rato|toxina|poison)/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - suspeita de envenenamento',
    riskLevel: 'high',
  },
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:teve|está\s+tendo)\s+convulsão/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - convulsão',
    riskLevel: 'high',
  },
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:está\s+)?sangrando\s+(?:muito|demais)/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - sangramento intenso',
    riskLevel: 'high',
  },
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:não\s+)?(?:consegue|mover|levantar)\s+andar/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - não consegue andar',
    riskLevel: 'high',
  },
  {
    pattern: /(?:pet|cachorro|gato|animal)\s+(?:em\s+)?emergência|urgência\s+(?:veterinária|do|para)/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica identificada',
    riskLevel: 'high',
  },
  // High priority
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:não\s+)?(?:come|alimenta|coma)\s+(?:há|não\s+come)\s+\d+\s+dia/i,
    priority: 'high',
    requiresHandoff: true,
    handoffReason: 'Pet sem se alimentar por múltiplos dias',
    riskLevel: 'medium',
  },
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:muito|demais|forte)\s+(?:doente|doendo|dor)/i,
    priority: 'high',
    requiresHandoff: true,
    handoffReason: 'Pet muito doente identificado',
    riskLevel: 'medium',
  },
];

/**
 * Complaint indicators that may require handoff
 * Based on specs/02_AGENT_BEHAVIOR.md
 */
const COMPLAINT_INDICATORS: ComplaintIndicator[] = [
  {
    pattern: /(?:quero|falei|falar)\s+com\s+(?:o|o|a)\s+responsável|gerente|supervisor|chefe/i,
    requiresHandoff: true,
    severity: 'high',
  },
  {
    pattern: /isso\s+é\s+(?:um\s+)?(?:absurdo|vergonha|desgraça)/i,
    requiresHandoff: true,
    severity: 'high',
  },
  {
    pattern: /vou\s+(?:procurar|buscar)\s+(?:os\s+)?(?:órgãos|procon|justiça|advogado)/i,
    requiresHandoff: true,
    severity: 'high',
  },
  {
    pattern: /(?:muito|demais)\s+(?:insatisfeito|triste|bravo|irritado)/i,
    requiresHandoff: true,
    severity: 'medium',
  },
  {
    pattern: /não\s+estou\s+aguentando\s+mais/i,
    requiresHandoff: true,
    severity: 'medium',
  },
  {
    pattern: /reclamação|reclamar|reclama/i,
    requiresHandoff: false, // Can handle initially
    severity: 'medium',
  },
];

/**
 * Sensitive financial patterns that may require handoff
 * Based on specs/08_HANDOFF_SYSTEM.md
 */
const FINANCIAL_PATTERNS: FinancialPattern[] = [
  {
    pattern: /(?:não|não\s+tenho)\s+(?:como|condição)\s+pagar/i,
    requiresHandoff: true,
  },
  {
    pattern: /quero\s+(?:solicitar|pedir)\s+reembolso/i,
    requiresHandoff: true,
  },
  {
    pattern: /discussão\s+de\s+valor|preço\s+muito\s+caro|muito\s+caro/i,
    requiresHandoff: false, // Can handle with options first
  },
  {
    pattern: /desconto|promoção|oferta\s+especial/i,
    requiresHandoff: false, // Can try to help
  },
  {
    pattern: /parcelamento|parcelar/i,
    requiresHandoff: false, // Can offer options
  },
];

/**
 * Human agent request patterns
 */
const HUMAN_REQUEST_PATTERNS: RegExp[] = [
  /quero\s+(?:falar|ser\s+atendido)\s+com\s+(?:humano|pessoa|atendente)/i,
  /mande\s+(?:um|uma)\s+(?:humano|pessoa|atendente)/i,
  /pode\s+chamar\s+(?:um|uma)\s+(?:atendente|humano)/i,
  /quero\s+falar\s+com\s+(?:humano|atendente)/i,
  /atendente\s+humano/i,
  /human[oa]/i,
];

/**
 * Greeting patterns
 */
const GREETING_PATTERNS: RegExp[] = [
  /^olá|^oi|^bom\s+dia|^boa\s+tarde|^boa\s+noite|^ei|^eai|^hey/i,
  /^olá|^oi|^bom\s+dia|^boa\s+tarde|^boa\s+noite/,
  /tudo\s+bem|beleza|como\s+vai|como\s+está/i,
  /^[a-zA-Z]{1,3}$/, // Very short messages like "Oi", "Olá"
];

/**
 * Service inquiry patterns
 */
const SERVICE_PATTERNS: RegExp[] = [
  /serviços?|o\s+que\s+vocês?\s+faz(?:em|em)?|quais?\s+serviços?/i,
  /(?:banho|banho\s+e\s+tosa|vacina|consulta|exame|cirurgia|emergência|internação)/i,
  /atendimento\s+(?:24h|emergência)/i,
];

/**
 * Hours of operation patterns
 */
const HOURS_PATTERNS: RegExp[] = [
  /horário|horas?\s+de\s+atendimento|que\s+horas?|fecha\s+que\s+horas|abre\s+que\s+horas/i,
  /(?:segunda|terça|quarta|quinta|sexta|sábado|domingo)\s+(?:fech|abert)/i,
  /funciona\s+(?:de|nas?|em)\s+(?:que|qual)/i,
];

/**
 * Price inquiry patterns
 */
const PRICE_PATTERNS: RegExp[] = [
  /preço|valor|custo|quanto\s+(?:custa|vai|cobram)|valor\s+da/i,
  /or[cç]amento|orçar|orcar|cobrar/i,
  /barato|caro|pesado/i,
];

/**
 * Scheduling patterns
 */
const SCHEDULING_PATTERNS: RegExp[] = [
  /agend|marcar|reservar|horário\s+(?:disponív|para)/i,
  /(?:quinta|sexta|sábado|domingo|segunda|terça|quarta)\s+\d{1,2}/i,
  /(?:manhã|tarde|noite)\s+(?:de\s+)?(?:hoje|amanhã)/i,
];

/**
 * Cancellation patterns
 */
const CANCELLATION_PATTERNS: RegExp[] = [
  /cancel|desmarcar|remover\s+(?:a\s+)?(?:consulta|agendamento)/i,
  /não\s+(?:posso|vou|poder)\s+ir|mudar\s+de\s+ideia/i,
];

/**
 * Clinical question patterns
 */
const CLINICAL_PATTERNS: RegExp[] = [
  /(?:meu|me|a)\s+(?:pet|cachorro|gato|animal)\s+está|tem|está\s+tendo/i,
  /o\s+que\s+(?:pode\s+ser|é|significa)/i,
  /dor|sintoma|tratamento|remédio|medicamento/i,
  /veterinári[oa]\s+pode|precisa\s+levar/i,
];

/**
 * Extract entities from message
 */
function extractEntities(message: string): IntentEntities {
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

  // Extract pet name (simple pattern - capitalized word after pet-related words)
  const petNameMatch = message.match(/(?:pet|cachorro|gato|animal|meu\s+bichinho)\s+([A-Z][a-z]+)/i);
  if (petNameMatch) {
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
function detectUrgency(message: string): { priority: IntentPriority; requiresHandoff: boolean; reason: string; riskLevel: 'high' | 'medium' | 'low' } | null {
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
function detectComplaint(message: string): { requiresHandoff: boolean; severity: 'high' | 'medium' } | null {
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
function detectFinancialSensitivity(message: string): boolean {
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
function detectHumanRequest(message: string): boolean {
  return HUMAN_REQUEST_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Classify the intent of a message
 */
export function classifyIntent(message: string, context?: ClassificationContext): IntentClassification {
  const normalizedMessage = message.toLowerCase().trim();
  const detectedKeywords: string[] = [];
  let intent: IntentType = 'none';
  let confidence = 0.5;
  let priority: IntentPriority = 'low';
  let requiresHandoff = false;
  let handoffReason: string | undefined;
  let riskLevel: 'high' | 'medium' | 'low' = 'low';

  // 1. Check for urgency first (critical - must be handled immediately)
  const urgency = detectUrgency(normalizedMessage);
  if (urgency) {
    intent = 'possivel_urgencia';
    priority = urgency.priority;
    requiresHandoff = urgency.requiresHandoff;
    handoffReason = urgency.reason;
    riskLevel = urgency.riskLevel;
    confidence = 0.95;
    detectedKeywords.push('urgencia');
    
    return {
      intent,
      confidence,
      priority,
      detectedKeywords,
      entities: extractEntities(message),
      requiresHandoff,
      handoffReason,
      riskLevel,
    };
  }

  // 2. Check for human request
  if (detectHumanRequest(normalizedMessage)) {
    intent = 'pedido_humano';
    confidence = 0.95;
    priority = 'high';
    requiresHandoff = true;
    handoffReason = 'Cliente solicitou atendimento humano';
    detectedKeywords.push('pedido_humano');
    
    return {
      intent,
      confidence,
      priority,
      detectedKeywords,
      entities: extractEntities(message),
      requiresHandoff,
      handoffReason,
      riskLevel: 'medium',
    };
  }

  // 3. Check for complaint
  const complaint = detectComplaint(normalizedMessage);
  if (complaint) {
    intent = 'reclamacao';
    confidence = 0.85;
    priority = complaint.severity === 'high' ? 'high' : 'medium';
    requiresHandoff = complaint.requiresHandoff;
    handoffReason = complaint.requiresHandoff ? 'Reclamação que requer intervenção humana' : undefined;
    riskLevel = complaint.severity === 'high' ? 'high' : 'medium';
    detectedKeywords.push('reclamacao');
    
    return {
      intent,
      confidence,
      priority,
      detectedKeywords,
      entities: extractEntities(message),
      requiresHandoff,
      handoffReason,
      riskLevel,
    };
  }

  // 4. Check for financial sensitivity
  if (detectFinancialSensitivity(normalizedMessage)) {
    intent = 'financeiro_sensivel';
    confidence = 0.85;
    priority = 'high';
    requiresHandoff = true;
    handoffReason = 'Discussão financeira sensível';
    riskLevel = 'medium';
    detectedKeywords.push('financeiro');
    
    return {
      intent,
      confidence,
      priority,
      detectedKeywords,
      entities: extractEntities(message),
      requiresHandoff,
      handoffReason,
      riskLevel,
    };
  }

  // 5. Check for greetings
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(normalizedMessage)) {
      intent = 'saudacao';
      confidence = 0.9;
      priority = 'low';
      detectedKeywords.push('saudacao');
      break;
    }
  }

  // 6. Check for cancellation before generic scheduling/service matches
  if (intent === 'none') {
    for (const pattern of CANCELLATION_PATTERNS) {
      if (pattern.test(normalizedMessage)) {
        intent = 'cancelamento';
        confidence = 0.85;
        priority = 'medium';
        detectedKeywords.push('cancelamento');
        break;
      }
    }
  }

  // 7. Check for price inquiry before generic service matches like "consulta"
  if (intent === 'none') {
    for (const pattern of PRICE_PATTERNS) {
      if (pattern.test(normalizedMessage)) {
        intent = 'precos';
        confidence = 0.85;
        priority = 'low';
        detectedKeywords.push('precos');
        break;
      }
    }
  }

  // 8. Check for scheduling before hours/service matches
  if (intent === 'none') {
    for (const pattern of SCHEDULING_PATTERNS) {
      if (pattern.test(normalizedMessage)) {
        intent = 'agendamento';
        confidence = 0.8;
        priority = 'medium';
        detectedKeywords.push('agendamento');
        break;
      }
    }
  }

  // 9. Check for hours inquiry
  if (intent === 'none') {
    for (const pattern of HOURS_PATTERNS) {
      if (pattern.test(normalizedMessage)) {
        intent = 'horarios';
        confidence = 0.85;
        priority = 'low';
        detectedKeywords.push('horarios');
        break;
      }
    }
  }

  // 10. Check for service inquiry
  if (intent === 'none') {
    for (const pattern of SERVICE_PATTERNS) {
      if (pattern.test(normalizedMessage)) {
        intent = 'servicos';
        confidence = 0.85;
        priority = 'low';
        detectedKeywords.push('servicos');
        break;
      }
    }
  }

  // 11. Check for clinical questions
  if (intent === 'none') {
    for (const pattern of CLINICAL_PATTERNS) {
      if (pattern.test(normalizedMessage)) {
        intent = 'duvida_clinica';
        confidence = 0.75;
        priority = 'medium';
        // Clinical questions don't always require handoff, but need careful handling
        requiresHandoff = false;
        detectedKeywords.push('duvida_clinica');
        break;
      }
    }
  }

  // 12. If no intent detected, set as unknown
  if (intent === 'none') {
    intent = '不明';
    confidence = 0.3; // Low confidence for unknown
    priority = 'low';
    requiresHandoff = false;
    // If we can't classify, recommend handoff on low confidence
    if (context?.conversationHistory && context.conversationHistory.length > 3) {
      requiresHandoff = true;
      handoffReason = 'Intenção não detectada após múltiplas tentativas';
    }
  }

  logger.info('Intent classified', {
    intent,
    confidence,
    priority,
    requiresHandoff,
    keywords: detectedKeywords,
  });

  return {
    intent,
    confidence,
    priority,
    detectedKeywords,
    entities: extractEntities(message),
    requiresHandoff,
    handoffReason,
    riskLevel,
  };
}

/**
 * Get recommended response action based on intent
 */
export function getRecommendedAction(classification: IntentClassification): {
  shouldRespond: boolean;
  shouldUseKnowledge: boolean;
  responseTone: 'empathetic' | 'informative' | 'urgent' | 'neutral';
} {
  switch (classification.intent) {
    case 'possivel_urgencia':
      return {
        shouldRespond: true,
        shouldUseKnowledge: false,
        responseTone: 'urgent',
      };
    case 'reclamacao':
      return {
        shouldRespond: true,
        shouldUseKnowledge: false,
        responseTone: 'empathetic',
      };
    case 'saudacao':
      return {
        shouldRespond: true,
        shouldUseKnowledge: false,
        responseTone: 'neutral',
      };
    case 'horarios':
    case 'servicos':
    case 'precos':
      return {
        shouldRespond: true,
        shouldUseKnowledge: true,
        responseTone: 'informative',
      };
    case 'agendamento':
    case 'cancelamento':
      return {
        shouldRespond: true,
        shouldUseKnowledge: true,
        responseTone: 'informative',
      };
    case 'duvida_clinica':
      return {
        shouldRespond: true,
        shouldUseKnowledge: true,
        responseTone: 'empathetic',
      };
    case 'pedido_humano':
      return {
        shouldRespond: true,
        shouldUseKnowledge: false,
        responseTone: 'neutral',
      };
    case 'financeiro_sensivel':
      return {
        shouldRespond: true,
        shouldUseKnowledge: true,
        responseTone: 'empathetic',
      };
    case '不明':
    default:
      return {
        shouldRespond: true,
        shouldUseKnowledge: false,
        responseTone: 'neutral',
      };
  }
}
