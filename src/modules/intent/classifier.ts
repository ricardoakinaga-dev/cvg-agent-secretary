// Intent Classifier for Phase 4 - Operational Secretary
// Based on specs/02_AGENT_BEHAVIOR.md, specs/08_HANDOFF_SYSTEM.md, specs/10_SECURITY_AND_GUARDRAILS.md

import { logger } from '../logging';
import type {
  ClassificationContext,
  IntentClassification,
  IntentPriority,
  IntentType,
} from './types';
import {
  CANCELLATION_PATTERNS,
  CLINICAL_PATTERNS,
  GREETING_PATTERNS,
  HOURS_PATTERNS,
  PRICE_PATTERNS,
  SCHEDULING_PATTERNS,
  SERVICE_PATTERNS,
} from './patterns';
import {
  detectComplaint,
  detectFinancialSensitivity,
  detectHumanRequest,
  detectUrgency,
  extractEntities,
  looksLikeSchedulingFollowUp,
} from './detectors';

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

  // 7. Keep date/time follow-ups inside the scheduling flow.
  if (intent === 'none' && looksLikeSchedulingFollowUp(normalizedMessage, context)) {
    intent = 'agendamento';
    confidence = 0.82;
    priority = 'medium';
    detectedKeywords.push('agendamento');
  }

  // 8. Check for price inquiry before generic service matches like "consulta"
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

  // 9. Check for scheduling before hours/service matches
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

  // 10. Check for hours inquiry
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

  // 11. Check for clinical questions before generic service matches like "consulta"
  // so sick-pet consultation requests are handled with clinical guardrails.
  if (intent === 'none') {
    for (const pattern of CLINICAL_PATTERNS) {
      if (pattern.test(normalizedMessage)) {
        intent = 'duvida_clinica';
        confidence = 0.78;
        priority = 'medium';
        // Clinical questions don't always require handoff, but need careful handling
        requiresHandoff = false;
        detectedKeywords.push('duvida_clinica');
        break;
      }
    }
  }

  // 12. Check for service inquiry
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

  // 13. If no intent detected, set as unknown. Use a Portuguese/internal-safe
  // label and still consult knowledge; ambiguous customer messages often need
  // business rules or institutional context, and skipping RAG here degrades
  // answer quality.
  if (intent === 'none') {
    intent = 'desconhecido';
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
    case 'desconhecido':
    default:
      return {
        shouldRespond: true,
        shouldUseKnowledge: true,
        responseTone: 'informative',
      };
  }
}
